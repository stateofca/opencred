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

export const DC_API_OID4VP_ACCEPTED_PROTOCOLS = Object.freeze([
  DC_API_OID4VP_PROTOCOLS.v1Signed,
  DC_API_OID4VP_PROTOCOLS.v1Unsigned,
  DC_API_OID4VP_PROTOCOLS.v1Multisigned,
  DC_API_OID4VP_PROTOCOLS.legacy
]);

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
