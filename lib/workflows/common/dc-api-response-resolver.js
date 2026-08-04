/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DC_API_OID4VP_ACCEPTED_PROTOCOLS} from './dc-api-envelope.js';
import {logger} from '../../logger.js';

/**
 * No pending request matches the protocol the wallet answered with. Either the
 * wallet responded to something we never asked for, or the exchange's pending
 * requests were already spent.
 */
export class DcApiResponseUnmatchedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DcApiResponseUnmatchedError';
    this.statusCode = 400;
    this.errorCode = 'DC_API_RESPONSE_UNMATCHED';
  }
}

/**
 * Several pending requests share the protocol the wallet answered with, so the
 * response cannot be attributed to one of them.
 *
 * Unreachable for any configuration that passed `validateDcApiButtons`, which
 * rejects a button whose profiles collide on protocol. Reaching it means a
 * pending set was built by some path that bypassed that check — a bug worth an
 * unmistakable error rather than a silent guess at which key material to verify
 * against.
 */
export class DcApiResponseAmbiguousError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DcApiResponseAmbiguousError';
    this.statusCode = 400;
    this.errorCode = 'DC_API_RESPONSE_AMBIGUOUS';
  }
}

/**
 * The DC API protocol identifier a response body claims, or null when the body
 * is not a DC API response at all (a `direct_post` form body, say).
 *
 * @param {object} responseBody - Parsed response body.
 * @returns {string|null} Recognized protocol identifier, or null.
 */
export function responseProtocol(responseBody) {
  const protocol = responseBody?.protocol;
  if(typeof protocol !== 'string') {
    return null;
  }
  return DC_API_OID4VP_ACCEPTED_PROTOCOLS.includes(protocol) ? protocol : null;
}

/**
 * The `kid` a wallet echoed in an encrypted response's JWE protected header.
 *
 * A conforming wallet echoes the `kid` of the response-encryption key it used,
 * which we minted per request — so this identifies the pending request without
 * decrypting anything. Only a cross-check: protocol matching is what actually
 * routes, and a wallet is not obliged to echo it.
 *
 * Parsing is best-effort by design. The input is wallet-supplied, so a
 * malformed header must degrade to "no cross-check available" rather than fail
 * a response that protocol matching already resolved.
 *
 * @param {object} responseBody - Parsed DC API response body.
 * @returns {string|null} The `kid`, or null when absent or unparseable.
 */
export function responseJweKid(responseBody) {
  const value = responseBody?.data?.response ?? responseBody?.data?.Response;
  if(typeof value !== 'string') {
    return null;
  }
  const [header] = value.split('.');
  // A compact JWE has five segments; anything else is not one (Annex C, for
  // instance, carries base64url CBOR rather than a JWE).
  if(!header || value.split('.').length !== 5) {
    return null;
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(header, 'base64url').toString('utf8'));
    return typeof decoded?.kid === 'string' ? decoded.kid : null;
  } catch {
    return null;
  }
}

/**
 * Select the pending DC API request that a wallet response answers.
 *
 * Routing is by DC API protocol identifier. That is unambiguous because config
 * load rejects a button whose profiles collide on protocol — such a button
 * would be requesting the same wire format twice, which is redundant anyway
 * since one request already reaches every wallet that reads that format.
 *
 * Protocol is the only signal the W3C Digital Credentials API actually gives
 * us. `DigitalCredential` exposes exactly `protocol` and `data`; the response
 * carries no index or identifier saying which entry of `digital.requests` was
 * satisfied. Nor can anything richer be read from the payload before choosing
 * a key: an Annex C response is HPKE-encrypted CBOR with no DCQL and no
 * `state`, and an encrypted OID4VP response hides both inside the JWE.
 *
 * `declaredProfile` and `jweKid` only ever narrow among candidates that already
 * agree with `protocol`. `declaredProfile` in particular is a client-supplied
 * hint: it must never select an entry whose protocol disagrees with the
 * response, or a client could steer which stored key material is used to verify
 * a response it supplied.
 *
 * @param {object} options - Options.
 * @param {Array<object>} options.pending - Pending request entries, from
 *   `readPendingRequests`.
 * @param {string} options.protocol - Protocol from the wallet response.
 * @param {string} [options.declaredProfile] - Profile the client believes
 *   answered. Hint only.
 * @param {string} [options.jweKid] - `kid` from an encrypted response's JWE
 *   protected header. Cross-check only.
 * @returns {{entry: object, matchedBy: string}} The matched entry, and which
 *   signal resolved it.
 */
export function resolvePendingDcApiRequest({
  pending, protocol, declaredProfile, jweKid
} = {}) {
  const entries = Array.isArray(pending) ? pending : [];
  const candidates = entries.filter(e => e.protocol === protocol);

  if(candidates.length === 0) {
    throw new DcApiResponseUnmatchedError(
      `No pending authorization request matches DC API protocol ` +
      `"${protocol}". Pending protocols: ` +
      `${entries.map(e => e.protocol ?? 'unknown').join(', ') || '<none>'}.`);
  }

  if(candidates.length === 1) {
    const [entry] = candidates;
    // A kid that disagrees is an anomaly, not grounds to reject: protocol
    // matching already resolved this uniquely, and the wallet may legitimately
    // omit or differ on kid.
    if(jweKid && entry.kid && jweKid !== entry.kid) {
      logger.warning(
        'DC API response kid does not match the protocol-matched pending ' +
        'request; proceeding on the protocol match.',
        {profile: entry.profile, protocol, expectedKid: entry.kid, jweKid});
    }
    return {entry, matchedBy: 'protocol'};
  }

  // Should be unreachable for a config that passed validateDcApiButtons.
  // Narrow rather than guess, and fail loudly if narrowing does not settle it.
  if(jweKid) {
    const byKid = candidates.filter(e => e.kid === jweKid);
    if(byKid.length === 1) {
      return {entry: byKid[0], matchedBy: 'kid'};
    }
  }
  if(declaredProfile) {
    const byProfile = candidates.filter(e => e.profile === declaredProfile);
    if(byProfile.length === 1) {
      return {entry: byProfile[0], matchedBy: 'declaredProfile'};
    }
  }

  throw new DcApiResponseAmbiguousError(
    `${candidates.length} pending authorization requests share DC API ` +
    `protocol "${protocol}" (${candidates.map(c => c.profile).join(', ')}), ` +
    'so the response cannot be attributed to one of them. A button must not ' +
    'request the same wire format twice.');
}
