/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const DC_API_OID4VP_PROTOCOLS = Object.freeze({
  v1Signed: 'openid4vp-v1-signed',
  v1Unsigned: 'openid4vp-v1-unsigned',
  v1Multisigned: 'openid4vp-v1-multisigned',
  legacy: 'openid4vp'
});

/** DC API protocol identifier for ISO mdoc DeviceRequest (Annex C). */
export const ANNEX_C_DC_API_PROTOCOL = 'org-iso-mdoc';

export const DC_API_OID4VP_ACCEPTED_PROTOCOLS = Object.freeze([
  DC_API_OID4VP_PROTOCOLS.v1Signed,
  DC_API_OID4VP_PROTOCOLS.v1Unsigned,
  DC_API_OID4VP_PROTOCOLS.v1Multisigned,
  DC_API_OID4VP_PROTOCOLS.legacy,
  ANNEX_C_DC_API_PROTOCOL
]);

/**
 * The DC API protocol identifier each DC API profile puts on the wire.
 *
 * Keyed by the profile as **resolved** by `identifyProfile`, not as requested:
 * `identifyProfile` redirects (`cadmv-android` / `18013-7-Annex-D` become
 * `18013-7-Annex-D-spruceid` when `workflow.dcApiNamespaceQuery` is set, and
 * the Annex C lane likewise), so looking a raw request parameter up in this map
 * can give the wrong answer.
 *
 * Profiles absent from this map do not produce a DC API wire envelope at all —
 * `18013-7-Annex-B` and the standard/draft-18 OID4VP profiles return a signed
 * JAR JWT instead. That absence is load-bearing: it is how a multi-profile
 * authorization request rejects a profile it cannot represent as one element of
 * a JSON array.
 *
 * Each entry was derived by following the profile through
 * `oid4vp-dispatcher.js` to its handler and reading which envelope builder that
 * handler calls. `test/unit/workflows/58-profile-dc-api-protocol.test.js` pins
 * the whole composition — `identifyProfile` through handler to protocol — so
 * this map cannot silently drift from what the handlers actually emit.
 *
 * One subtlety worth knowing before editing: the `18013-7-Annex-D` handler can
 * also emit `openid4vp-v1-unsigned`, but only when called with `signed: false`,
 * and `identifyProfile` returns `signed: true` unconditionally for that lane.
 * The unsigned branch is therefore unreachable through the authorization
 * request middleware. If that ever changes, `18013-7-Annex-D` stops having a
 * single protocol and the response routing in
 * `dc-api-response-resolver.js` needs revisiting — hence the composition test.
 */
export const PROFILE_DC_API_PROTOCOL = Object.freeze({
  // ISO 18013-7 Annex C lane — CBOR mdoc DeviceRequest + HPKE encryption info.
  '18013-7-Annex-C': ANNEX_C_DC_API_PROTOCOL,
  '18013-7-Annex-C-spruceid': ANNEX_C_DC_API_PROTOCOL,
  'apple-wallet': ANNEX_C_DC_API_PROTOCOL,
  'cadmv-ios': ANNEX_C_DC_API_PROTOCOL,
  // ISO 18013-7 Annex D / OID4VP 1.0 lane — signed JAR JWT.
  '18013-7-Annex-D': DC_API_OID4VP_PROTOCOLS.v1Signed,
  '18013-7-Annex-D-spruceid': DC_API_OID4VP_PROTOCOLS.v1Signed,
  'cadmv-android': DC_API_OID4VP_PROTOCOLS.v1Signed,
  'google-wallet': DC_API_OID4VP_PROTOCOLS.v1Signed,
  'OID4VP-HAIP-1.0': DC_API_OID4VP_PROTOCOLS.v1Signed
});

/**
 * The DC API protocol identifier a resolved profile emits.
 *
 * @param {object} options - Options.
 * @param {string} options.profile - Profile identifier, as resolved by
 *   `identifyProfile`.
 * @returns {string|null} Protocol identifier, or null when the profile does not
 *   produce a DC API wire envelope.
 */
export function dcApiProtocolForProfile({profile} = {}) {
  if(typeof profile !== 'string') {
    return null;
  }
  return PROFILE_DC_API_PROTOCOL[profile] ?? null;
}

/**
 * Whether a resolved profile produces a DC API wire envelope.
 *
 * @param {object} options - Options.
 * @param {string} options.profile - Profile identifier, as resolved by
 *   `identifyProfile`.
 * @returns {boolean} True when the profile is a DC API profile.
 */
export function isDcApiProfile({profile} = {}) {
  return dcApiProtocolForProfile({profile}) !== null;
}

/**
 * Field names that must not appear in the `data` object of an unsigned
 * Annex D / OID4VP-1.0-unsigned DC API request envelope (OID4VP 1.0 §A.3).
 */
export const UNSIGNED_ANNEX_D_FORBIDDEN_FIELDS = Object.freeze([
  'client_id',
  'client_id_scheme',
  'expected_origins'
]);

/**
 * Returns a shallow copy of `authorizationRequest` with
 * {@link UNSIGNED_ANNEX_D_FORBIDDEN_FIELDS} removed. Does not mutate input.
 *
 * @param {object} authorizationRequest - Plain object authorization request.
 * @returns {object} Copy without forbidden fields.
 */
export const stripFieldsForUnsignedAnnexD = authorizationRequest => {
  if(!isPlainObject(authorizationRequest)) {
    throw new Error('authorizationRequest must be a plain object');
  }
  const out = {...authorizationRequest};
  for(const field of UNSIGNED_ANNEX_D_FORBIDDEN_FIELDS) {
    delete out[field];
  }
  return out;
};

/**
 * Builds a frozen DC API OID4VP request envelope.
 *
 * @param {object} options - Request fields.
 * @param {string} options.protocol - Accepted protocol id string.
 * @param {object} options.data - Plain JSON-serializable payload.
 * @returns {{protocol: string, data: object}} Frozen protocol envelope.
 */
export const buildDcApiRequest = ({protocol, data}) => {
  if(!DC_API_OID4VP_ACCEPTED_PROTOCOLS.includes(protocol)) {
    throw new Error(`Unsupported DC API protocol: "${protocol}"`);
  }
  if(!isPlainObject(data)) {
    throw new Error('DC API request data must be a plain object');
  }
  return Object.freeze({protocol, data});
};

/**
 * Builds the Annex C DC API wire envelope (deviceRequest + encryptionInfo).
 *
 * @param {object} options - Envelope options.
 * @param {string} options.deviceRequest - Non-empty base64url device request.
 * @param {string} options.encryptionInfo - Non-empty base64url encryption
 *   info.
 * @returns {{protocol: string, data: object}} Frozen protocol envelope.
 */
export const buildAnnexCDcApiRequest = ({deviceRequest, encryptionInfo}) => {
  if(typeof deviceRequest !== 'string' || deviceRequest.length === 0) {
    throw new Error(
      'buildAnnexCDcApiRequest: deviceRequest must be a non-empty string');
  }
  if(typeof encryptionInfo !== 'string' || encryptionInfo.length === 0) {
    throw new Error(
      'buildAnnexCDcApiRequest: encryptionInfo must be a non-empty string');
  }
  const data = Object.freeze({deviceRequest, encryptionInfo});
  return Object.freeze({protocol: ANNEX_C_DC_API_PROTOCOL, data});
};

/**
 * Builds the Annex D DC API wire envelope (signed JWT or unsigned object).
 *
 * @param {object} options - Envelope options.
 * @param {boolean} options.signed - True for JAR-signed, false for unsigned.
 * @param {object} [options.authorizationRequest] - Required when signed=false.
 * @param {string} [options.signedJwt] - Required when signed=true.
 * @returns {{protocol: string, data: object}} Frozen protocol envelope.
 */
export const buildAnnexDDcApiRequest = ({
  signed,
  authorizationRequest,
  signedJwt
}) => {
  if(signed !== true && signed !== false) {
    throw new Error('buildAnnexDDcApiRequest: signed must be a boolean');
  }
  if(signed === true) {
    if(typeof signedJwt !== 'string') {
      throw new Error(
        'buildAnnexDDcApiRequest: signedJwt is required when signed=true');
    }
    return buildDcApiRequest({
      protocol: DC_API_OID4VP_PROTOCOLS.v1Signed,
      data: {request: signedJwt}
    });
  }
  if(!isPlainObject(authorizationRequest)) {
    throw new Error(
      'buildAnnexDDcApiRequest: authorizationRequest must be a plain object ' +
      'when signed=false');
  }
  return buildDcApiRequest({
    protocol: DC_API_OID4VP_PROTOCOLS.v1Unsigned,
    data: stripFieldsForUnsignedAnnexD(authorizationRequest)
  });
};

/**
 * Normalizes a DC API OID4VP response body (pure validation + unwrap).
 * Callers that need conformance telemetry when `isLegacyProtocol` is
 * true should call `logUtils.legacyProtocolIdentifier` after unwrap.
 *
 * @param {object | null | undefined} body - Parsed JSON from the client.
 * @returns {{protocol: string, data: *, isLegacyProtocol: boolean}}
 *   Unwrapped body fields.
 */
export const unwrapDcApiOid4vpResponse = body => {
  if(body == null) {
    throw new Error('DC API response body is required');
  }
  const {protocol} = body;
  if(!DC_API_OID4VP_ACCEPTED_PROTOCOLS.includes(protocol)) {
    throw new Error(`Unsupported DC API protocol: "${protocol}"`);
  }
  const isLegacyProtocol = protocol === DC_API_OID4VP_PROTOCOLS.legacy;
  return {protocol, data: body.data, isLegacyProtocol};
};

/**
 * Extract a single vp_token from a string or an array.
 * OID4VP 1.0 / DC API wallets may return credential values as arrays.
 *
 * @param {string|Array} value - Value for one credential ID in vp_token.
 * @returns {string|*} The token string, or the original value if not an array.
 */
export const normalizeVpTokenValue = value => {
  // Note that this function may change semantics if in the future OpenCred
  // enables queries requesting credential groups / multiple credentials.
  if(Array.isArray(value)) {
    if(value.length === 0) {
      throw new Error('vp_token array is empty for credential ID');
    }
    return value[0];
  }
  return value;
};

/**
 * Normalize a vp_token map: unwrap array values to their first element.
 * OID4VP 1.0 wallets may return vp_token values as arrays; SpruceID WASM
 * expects map values to be strings. Returns a new object.
 *
 * @param {object|null|undefined} vpToken - Map of credential ID to string
 *   or array.
 * @returns {object|null|undefined} Shallow copy with array values reduced
 *   to strings.
 */
export const normalizeVpTokenMap = vpToken => {
  // Note that this function may change semantics if in the future OpenCred
  // enables queries requesting credential groups / multiple credentials.
  if(
    vpToken == null ||
    typeof vpToken !== 'object' ||
    Array.isArray(vpToken)
  ) {
    return vpToken;
  }
  const out = {};
  for(const [key, value] of Object.entries(vpToken)) {
    if(Array.isArray(value)) {
      if(value.length === 0) {
        throw new Error(
          `vp_token array is empty for credential ID "${key}"`);
      }
      out[key] = value[0];
    } else {
      out[key] = value;
    }
  }
  return out;
};

function isPlainObject(value) {
  if(value === null || typeof value !== 'object') {
    return false;
  }
  if(Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
