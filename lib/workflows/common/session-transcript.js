/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import crypto from 'node:crypto';
import {DataItem} from '@auth0/mdl';

/**
 * Build OpenID4VPDCAPIHandoverInfo for OID4VP 1.0 SessionTranscript
 * (OpenID for Verifiable Presentations 1.0 §B.2.6.2).
 *
 * @param {object} opts - Handover inputs.
 * @param {string} opts.origin - Verifier origin (e.g. HTTPS base URL).
 * @param {string} opts.nonce - OID4VP nonce.
 * @param {Uint8Array|null|undefined} [opts.jwkThumbprint] - SHA-256 JWK
 *   thumbprint bytes, null, or omitted (treated as null) when not used.
 * @returns {[string, string, Uint8Array|null|undefined]} Tuple for CBOR.
 */
export function buildOid4vpDcApiHandoverInfo(opts) {
  const {origin, nonce} = opts;
  const jwkThumbprint = 'jwkThumbprint' in opts ? opts.jwkThumbprint : null;

  if(typeof origin !== 'string' || origin.length === 0) {
    throw new Error('origin must be a non-empty string');
  }
  if(typeof nonce !== 'string' || nonce.length === 0) {
    throw new Error('nonce must be a non-empty string');
  }
  if(jwkThumbprint !== undefined && jwkThumbprint !== null &&
    !(jwkThumbprint instanceof Uint8Array)) {
    throw new Error(
      'jwkThumbprint must be a Uint8Array, null, or undefined');
  }
  return [origin, nonce, jwkThumbprint];
}

/**
 * Build OpenID4VPHandoverInfo for OID4VP 1.0 SessionTranscript
 * (OpenID for Verifiable Presentations 1.0 §B.2.6.2).
 *
 * @param {object} opts - Handover inputs.
 * @param {string} opts.clientId - Client identifier.
 * @param {string} opts.nonce - OID4VP nonce.
 * @param {string|null|undefined} [opts.responseUri] - Response URI for
 *   direct_post, or omitted (treated as undefined).
 * @param {Uint8Array|null|undefined} [opts.jwkThumbprint] - SHA-256 JWK
 *   thumbprint bytes, null, or omitted (treated as null) when not used.
 * @returns {[string, string, Uint8Array|null|undefined, string|null|undefined]}
 *   Tuple for CBOR.
 */
export function buildOid4vpDirectPostHandoverInfo(opts) {
  const {clientId, nonce} = opts;
  const jwkThumbprint = 'jwkThumbprint' in opts ? opts.jwkThumbprint : null;
  const responseUri = 'responseUri' in opts ? opts.responseUri : undefined;

  if(typeof clientId !== 'string' || clientId.length === 0) {
    throw new Error('clientId must be a non-empty string');
  }
  if(typeof nonce !== 'string' || nonce.length === 0) {
    throw new Error('nonce must be a non-empty string');
  }
  if(jwkThumbprint !== undefined && jwkThumbprint !== null &&
    !(jwkThumbprint instanceof Uint8Array)) {
    throw new Error(
      'jwkThumbprint must be a Uint8Array, null, or undefined');
  }
  if(responseUri !== undefined && responseUri !== null &&
    (typeof responseUri !== 'string' || responseUri.length === 0)) {
    throw new Error(
      'responseUri must be null, undefined, or a non-empty string');
  }
  return [clientId, nonce, jwkThumbprint, responseUri];
}

/**
 * Encode the OID4VP 1.0 SessionTranscript bytes for mdoc verification
 * (OpenID for Verifiable Presentations 1.0 §B.2.6.2).
 *
 * @param {object} options - Options object.
 * @param {string} options.responseMode - Response mode
 *   (`dc_api`, `dc_api.jwt`, or `direct_post`).
 * @param {string} [options.origin] - Origin for DC API modes
 *   (from `expected_origins`).
 * @param {string} [options.clientId] - Client ID for direct_post.
 * @param {string} options.nonce - Nonce from the authorization request.
 * @param {string|null|undefined} [options.responseUri] - Response URI for
 *   direct_post.
 * @param {Uint8Array|null|undefined} [options.jwkThumbprint] - JWK thumbprint
 *   for encrypted modes.
 * @returns {Uint8Array} Double-CBOR-encoded session transcript bytes.
 */
export function encodeSessionTranscript(options) {
  const {responseMode, origin, clientId, nonce} = options;
  let handover;

  if(responseMode === 'dc_api' || responseMode === 'dc_api.jwt') {
    const handoverInfo = buildOid4vpDcApiHandoverInfo({
      origin,
      nonce,
      ...('jwkThumbprint' in options ?
        {jwkThumbprint: options.jwkThumbprint} : {})
    });

    const handoverInfoBytes = DataItem.fromData(handoverInfo).buffer;

    const hash = crypto.createHash('sha256');
    hash.update(handoverInfoBytes);
    const handoverInfoHash = new Uint8Array(hash.digest());

    handover = ['OpenID4VPDCAPIHandover', handoverInfoHash];
  } else if(responseMode === 'direct_post') {
    const handoverInfo = buildOid4vpDirectPostHandoverInfo({
      clientId,
      nonce,
      ...('jwkThumbprint' in options ?
        {jwkThumbprint: options.jwkThumbprint} : {}),
      ...('responseUri' in options ?
        {responseUri: options.responseUri} : {})
    });

    const handoverInfoBytes = DataItem.fromData(handoverInfo).buffer;

    const hash = crypto.createHash('sha256');
    hash.update(handoverInfoBytes);
    const handoverInfoHash = new Uint8Array(hash.digest());

    handover = ['OpenID4VPHandover', handoverInfoHash];
  } else {
    throw new Error(
      `Unsupported response_mode for session transcript: ${responseMode}`
    );
  }

  const encoded = DataItem.fromData([
    null,
    null,
    handover
  ]);
  return DataItem.fromData(encoded).buffer;
}
