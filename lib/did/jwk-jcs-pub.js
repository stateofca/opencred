/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import * as EcdsaMultikey from '@digitalbazaar/ecdsa-multikey';
import {decode as base58Decode, encode as base58Encode} from 'base58-universal';
import {canonicalize} from 'json-canonicalize';

// did:key jwk_jcs-pub (multicodec 0xeb51): EUDI Wallet / EBSI issuers represent
// P-256 keys as a JCS-serialized JWK rather than a raw multikey. The base58
// prefix is NOT a reliable string discriminator: it varies by curve
// (P-256/384/521 JWKs are 126/168/216 bytes) and by any non-canonical JWK
// members, so we use the decoded multicodec varint header instead of a string
// prefix.
//
// This supports did:key identifiers as used in the EBSI and EUDI initiatives.
// https://hub.ebsi.eu/docs/onboarding/natural-person/did-key-method
//
// Canonicalization (JCS) is required by this scheme. Only the canonical form of
// the JWK is accepted.
//
// Future work: only P-256 is supported. P-384 (168-byte JWK) and P-521
// (216-byte JWK) jwk_jcs-pub keys are not yet supported.

/** The multicodec identifier for a JCS-serialized public JWK. */
export const MULTICODEC_JWK_JCS_PUB = 0xeb51;

// Unsigned LEB128 varint of 0xeb51.
const MULTICODEC_JWK_JCS_PUB_HEADER = Uint8Array.from([0xd1, 0xd6, 0x03]);

const DID_KEY_PREFIX = 'did:key:';
const DID_CONTEXT_URL = 'https://www.w3.org/ns/did/v1';
const JWK_2020_CONTEXT_URL = 'https://w3id.org/security/suites/jws-2020/v1';

// A P-256 coordinate must be exactly 32 bytes, encoded as unpadded base64url
// (RFC 7518 §6.2.1.2). Reject padded/standard-base64 forms and any length other
// than 32 so a key has exactly one canonical coordinate representation.
const P256_COORDINATE_BYTES = 32;
const isCanonicalP256Coordinate = b64u => {
  if(typeof b64u !== 'string' || /[+/=]/.test(b64u)) {
    return false;
  }
  const bytes = Buffer.from(b64u, 'base64url');
  return bytes.length === P256_COORDINATE_BYTES &&
    bytes.toString('base64url') === b64u;
};

/**
 * Reads an unsigned LEB128 varint from the head of `bytes`.
 *
 * @param {Uint8Array} bytes - The bytes to read from.
 * @returns {{value: number, length: number}} The decoded value and the number
 *   of bytes consumed.
 */
export const readVarint = bytes => {
  let value = 0;
  let i = 0;
  for(; i < bytes.length; i++) {
    value += (bytes[i] & 0x7f) * (2 ** (7 * i));
    if((bytes[i] & 0x80) === 0) {
      return {value, length: i + 1};
    }
  }
  return {value, length: i};
};

/**
 * Computes the canonical jwk_jcs-pub `did:key` identifier for a P-256 JWK,
 * using only the required `{crv, kty, x, y}` members serialized per JCS.
 *
 * @param {object} options - Options.
 * @param {object} options.jwk - A P-256 public JWK.
 * @returns {string} The canonical `did:key:z…` identifier.
 */
export const canonicalJwkJcsPubDid = ({jwk}) => {
  const canonical = {crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y};
  const jwkBytes = new TextEncoder().encode(canonicalize(canonical));
  const bytes = new Uint8Array(
    MULTICODEC_JWK_JCS_PUB_HEADER.length + jwkBytes.length);
  bytes.set(MULTICODEC_JWK_JCS_PUB_HEADER, 0);
  bytes.set(jwkBytes, MULTICODEC_JWK_JCS_PUB_HEADER.length);
  return `${DID_KEY_PREFIX}z${base58Encode(bytes)}`;
};

/**
 * Decodes and validates a jwk_jcs-pub (`0xeb51`) `did:key` identifier.
 *
 * Fails closed: if the DID uses the jwk_jcs-pub multicodec but is not a
 * strictly canonical P-256 key, this throws. If the DID is not a jwk_jcs-pub
 * key at all, it returns `null` so the caller can fall through to the base
 * driver.
 *
 * @param {object} options - Options.
 * @param {string} options.did - A `did:key` identifier (optionally with a
 *   `#fragment`).
 * @returns {Promise<{jwk: object, multibase: string}|null>} The canonical
 *   `{crv,kty,x,y}` JWK and the identifier's multibase, or `null` if not a
 *   jwk_jcs-pub key.
 */
export const decodeJwkJcsPubDidKey = async ({did}) => {
  if(typeof did !== 'string' || !did.startsWith(`${DID_KEY_PREFIX}z`)) {
    return null;
  }
  const authority = did.split('#')[0];
  const multibase = authority.slice(DID_KEY_PREFIX.length);
  let decoded;
  try {
    decoded = base58Decode(multibase.slice(1));
  } catch {
    return null;
  }
  if(!decoded?.length) {
    return null;
  }
  const {value: multicodec, length} = readVarint(decoded);
  if(multicodec !== MULTICODEC_JWK_JCS_PUB) {
    return null;
  }
  // From here the DID uses the jwk_jcs-pub multicodec, so any problem is a
  // rejection (fail closed) rather than a fall-through.
  let jwk;
  try {
    jwk = JSON.parse(new TextDecoder().decode(decoded.slice(length)));
  } catch(e) {
    throw new Error(`Invalid jwk_jcs-pub did:key payload: ${e.message}`);
  }
  if(jwk?.kty !== 'EC' || jwk?.crv !== 'P-256' ||
    typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new Error(
      'Unsupported jwk_jcs-pub did:key: only P-256 EC keys are supported');
  }
  if(!isCanonicalP256Coordinate(jwk.x) || !isCanonicalP256Coordinate(jwk.y)) {
    throw new Error('non-canonical jwk_jcs-pub did:key rejected');
  }
  const canonicalJwk = {crv: 'P-256', kty: 'EC', x: jwk.x, y: jwk.y};
  // Malleability gate: the identifier must be the canonical encoding of the
  // required members. This rejects extra/reordered members and non-32-byte
  // coordinates, all of which fail to reproduce the exact input DID.
  if(canonicalJwkJcsPubDid({jwk: canonicalJwk}) !== authority) {
    throw new Error('non-canonical jwk_jcs-pub did:key rejected');
  }
  // Confirm the coordinates form a usable P-256 key.
  try {
    await EcdsaMultikey.fromJwk({jwk: canonicalJwk});
  } catch(e) {
    throw new Error(`Invalid jwk_jcs-pub P-256 key: ${e.message}`);
  }
  return {jwk: canonicalJwk, multibase};
};

// Builds a DID document keyed to the requested jwk_jcs-pub DID with a single
// JsonWebKey2020 verification method carrying the canonical public JWK.
const buildDidDocument = ({did, multibase, jwk}) => {
  const vmId = `${did}#${multibase}`;
  const verificationMethod = {
    id: vmId,
    type: 'JsonWebKey2020',
    controller: did,
    publicKeyJwk: {crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y}
  };
  return {
    '@context': [DID_CONTEXT_URL, JWK_2020_CONTEXT_URL],
    id: did,
    verificationMethod: [verificationMethod],
    authentication: [vmId],
    assertionMethod: [vmId],
    capabilityDelegation: [vmId],
    capabilityInvocation: [vmId]
  };
};

/**
 * Resolves a jwk_jcs-pub (`0xeb51`) `did:key` identifier to a DID document (or,
 * for a key-id URL, the verification method node) keyed to the requested DID.
 *
 * Returns `null` when the identifier is not a jwk_jcs-pub key, so a caller can
 * delegate to the stock did:key driver. Throws when the identifier uses the
 * jwk_jcs-pub multicodec but is not strictly canonical.
 *
 * @param {object} options - Options.
 * @param {string} options.id - A `did:key` identifier or key-id URL (optionally
 *   with a `#fragment`).
 * @returns {Promise<object|null>} The DID document, the verification method
 *   node, or `null` if not a jwk_jcs-pub identifier.
 */
export const resolveJwkJcsPubDidKey = async ({id} = {}) => {
  const decoded = typeof id === 'string' ?
    await decodeJwkJcsPubDidKey({did: id}) : null;
  if(!decoded) {
    return null;
  }
  const authority = id.split('#')[0];
  const didDocument = buildDidDocument({
    did: authority, multibase: decoded.multibase, jwk: decoded.jwk
  });
  const keyIdFragment = id.includes('#') ?
    id.slice(id.indexOf('#') + 1) : null;
  if(keyIdFragment) {
    const vm = didDocument.verificationMethod.find(
      m => m.id === `${authority}#${keyIdFragment}`);
    if(!vm) {
      throw new Error(`Key not found: ${id}`);
    }
    return {'@context': didDocument['@context'], ...vm};
  }
  return didDocument;
};
