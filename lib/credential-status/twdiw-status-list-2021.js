/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * DEPRECATED / NON-STANDARD. TWDIW-specific StatusList2021 handling.
 *
 * This module does NOT implement standard W3C StatusList2021 (deprecated). It
 * verifies a non-standard status-list envelope `{"statusList": "<JWT>"}` whose
 * inner JWT is a `StatusList2021Credential` signed with a `jku`-published key
 * (NOT the issuer's `iss` did:key). It is gated with the server or workflow
 * `twdiwStatusList2021Enabled` option, which is off by default. Standard flows
 * reject a `StatusList2021Entry` as an unsupported status type (see
 * `./index.js`). Prefer Bitstring Status List
 * (`@digitalbazaar/vc-bitstring-status-list`) for new work.
 */
import {
  decodeJwt, decodeProtectedHeader, importJWK, jwtVerify
} from 'jose';
import {agent} from '@bedrock/https-agent';
import {gunzipSync} from 'node:zlib';
import {httpClient} from '@digitalbazaar/http-client';

/** The `credentialStatus.type` handled by this module. */
export const TWDIW_STATUS_LIST_2021_ENTRY_TYPE = 'StatusList2021Entry';

/** Decompressed ceiling (10 MB) for a status-list bitstring (bomb guard). */
export const MAX_STATUS_LIST_BYTES = 10 * 1024 * 1024;

/**
 * Verifies a `StatusList2021Entry` credentialStatus (used by TWDIW VCs).
 *
 * The status list endpoint returns a non-standard envelope
 * `{"statusList": "<JWT>"}` whose inner JWT is a `StatusList2021Credential`.
 * `encodedList` is base64url(gzip(bitstring)); a set bit at `statusListIndex`
 * (MSB-first) means the credential is revoked/suspended. All helper throws are
 * caught and converted to `{verified: false, errors: [message]}` (fail-closed).
 *
 * Only reached when `twdiwStatusList2021Enabled` is set; the router in
 * `./index.js` otherwise rejects `StatusList2021Entry` as unsupported.
 *
 * @param {object} options - Options.
 * @param {object} options.credential - The credential being checked.
 * @returns {Promise<object>} A `{verified, errors}` status result.
 */
export const checkTwdiwStatusList2021 = async ({credential}) => {
  const issuerId = typeof credential?.issuer === 'string' ?
    credential.issuer : credential?.issuer?.id;
  const entries = arrayOf(credential?.credentialStatus)
    .filter(s => arrayOf(s.type).includes(TWDIW_STATUS_LIST_2021_ENTRY_TYPE));
  for(const entry of entries) {
    const url = entry.statusListCredential;
    // fetch and unwrap the non-standard {"statusList": "<JWT>"} envelope
    let listJwt;
    try {
      listJwt = await fetchStatusListJwt({url});
    } catch(e) {
      return {
        verified: false,
        errors: [`Unable to fetch status list (${url}): ${e.message}`]
      };
    }
    // verify the status list's signature (jku-published key; see helper)
    let payload;
    try {
      payload = await verifyStatusListSignature({listJwt, url, issuerId});
    } catch(e) {
      return {
        verified: false,
        errors: [`Status list signature invalid: ${e.message}`]
      };
    }
    // decode the bitstring and check this credential's index
    const cs = payload?.vc?.credentialSubject ?? {};
    let bytes;
    try {
      ({bytes} = decodeStatusList({encodedList: cs.encodedList}));
    } catch(e) {
      return {
        verified: false,
        errors: [`Unable to decode status list: ${e.message}`]
      };
    }
    // assert the list purpose matches the entry's purpose when both present
    const listPurpose = cs.statusPurpose;
    const entryPurpose = entry.statusPurpose;
    if(listPurpose && entryPurpose && listPurpose !== entryPurpose) {
      return {
        verified: false,
        errors: [`status list purpose "${listPurpose}" does not match ` +
          `entry purpose "${entryPurpose}"`]
      };
    }
    let bit;
    try {
      bit = readStatusBit({bytes, index: Number(entry.statusListIndex)});
    } catch(e) {
      return {verified: false, errors: [e.message]};
    }
    if(bit) {
      const purpose = listPurpose ?? entryPurpose;
      return {
        verified: false,
        errors: [purpose === 'suspension' ?
          'The credential has been suspended.' :
          'The credential has been revoked.']
      };
    }
  }
  return {verified: true};
};

/**
 * Fetches and unwraps a status-list JWT from a VC-attested URL.
 *
 * @param {object} options - Options.
 * @param {string} options.url - The `statusListCredential` URL (https only).
 * @returns {Promise<string>} The status-list JWT string.
 */
export async function fetchStatusListJwt({url}) {
  if(!url) {
    throw new Error('Missing statusListCredential URL');
  }
  if(new URL(url).protocol !== 'https:') {
    throw new Error('status list URL must be https');
  }
  const {data} = await httpClient.get(url, {agent});
  let listJwt = null;
  if(typeof data?.statusList === 'string') {
    listJwt = data.statusList;
  } else if(typeof data === 'string') {
    listJwt = data;
  }
  if(!listJwt) {
    throw new Error(`Unexpected status list at ${url}`);
  }
  return listJwt;
}

/**
 * Verifies the signature of a TWDIW status list JWT. The issuer signs status
 * lists with a key published at the JWT `jku` (its JWKS endpoint), NOT the key
 * embedded in its `iss` did:key, so we cannot verify via the did resolver.
 * Trust is bounded by: (1) the status list must be issued by the same issuer
 * as the credential, and (2) the `jku` must be same-origin as the VC-attested
 * statusListCredential URL (signing key fetched from the issuer's own infra
 * over TLS).
 *
 * @param {object} options - Options.
 * @param {string} options.listJwt - The status-list JWT to verify.
 * @param {string} options.url - The `statusListCredential` URL (origin pin).
 * @param {string} [options.issuerId] - The credential issuer id (required).
 * @returns {Promise<object>} The decoded (verified) JWT payload.
 */
export async function verifyStatusListSignature({listJwt, url, issuerId}) {
  const header = decodeProtectedHeader(listJwt);
  const payload = decodeJwt(listJwt);
  if(!issuerId) {
    throw new Error(
      'status list issuer binding missing: credential has no issuer');
  }
  if(payload.iss !== issuerId) {
    throw new Error('status list issuer does not match credential issuer');
  }
  if(!header.jku) {
    throw new Error('status list signing keys (jku) missing');
  }
  const jkuUrl = new URL(header.jku);
  if(jkuUrl.protocol !== 'https:') {
    throw new Error('status list jku must be https');
  }
  if(jkuUrl.origin !== new URL(url).origin) {
    throw new Error('status list signing keys (jku) are not same-origin');
  }
  const {data: jwks} = await httpClient.get(header.jku, {agent});
  const keys = Array.isArray(jwks?.keys) ? jwks.keys :
    (Array.isArray(jwks) ? jwks : []);
  const jwk = keys.find(k => k.kid === header.kid);
  if(!jwk) {
    throw new Error('no status list signing key matching kid');
  }
  await jwtVerify(
    listJwt, await importJWK({...jwk, alg: 'ES256'}, 'ES256'),
    {algorithms: ['ES256']});
  return payload;
}

/**
 * Decodes a base64url(gzip(bitstring)) status list, guarding against gzip
 * bombs via a decompressed-size ceiling.
 *
 * @param {object} options - Options.
 * @param {string} options.encodedList - The base64url(gzip(bitstring)).
 * @returns {{bytes: Buffer}} The decoded bitstring bytes.
 */
export function decodeStatusList({encodedList}) {
  const buf = Buffer.from(encodedList ?? '', 'base64url');
  // Node throws ERR_BUFFER_TOO_LARGE when inflated output exceeds the cap.
  const bytes = gunzipSync(buf, {maxOutputLength: MAX_STATUS_LIST_BYTES});
  return {bytes};
}

/**
 * Reads a single MSB-first status bit at `index` from a decoded bitstring.
 * Fails closed: throws on a non-integer, negative, or out-of-range index.
 *
 * @param {object} options - Options.
 * @param {Buffer|Uint8Array} options.bytes - The decoded bitstring bytes.
 * @param {number} options.index - The `statusListIndex` to read.
 * @returns {number} `0` or `1`.
 */
export function readStatusBit({bytes, index}) {
  if(!Number.isInteger(index) || index < 0) {
    throw new Error(`invalid statusListIndex: ${index}`);
  }
  const byteIndex = index >> 3;
  if(byteIndex >= bytes.length) {
    throw new Error(`statusListIndex ${index} out of range`);
  }
  return (bytes[byteIndex] >> (7 - (index % 8))) & 1;
}

function arrayOf(value) {
  if(Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}
