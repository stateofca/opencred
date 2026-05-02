/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {importPKCS8, SignJWT} from 'jose';
import {OID4VP_AUTHZ_REQ_JWT_TYP} from './oid4vp.js';

export {OID4VP_AUTHZ_REQ_JWT_TYP};

/**
 * Signs an OID4VP JAR authorization request JWT.
 *
 * @param {object} options - Signing inputs.
 * @param {object} options.authorizationRequest - JWT payload (claims).
 * @param {object} options.signingKey - Key material (`privateKeyPem`, `type`).
 * @param {string} options.kid - Default `kid` for the protected header.
 * @param {object} [options.signingMetadata] - Optional Annex-D header overrides
 *   (`alg`, `kid`, optional `x5c`).
 * @returns {Promise<string>} Compact-serialized signed JWT.
 */
export async function signJarJwt({
  authorizationRequest,
  signingKey,
  kid,
  signingMetadata
}) {
  if(authorizationRequest === undefined || authorizationRequest === null) {
    throw new Error('signJarJwt: authorizationRequest is required');
  }
  if(typeof authorizationRequest !== 'object' || Array.isArray(
    authorizationRequest)) {
    throw new Error('signJarJwt: authorizationRequest is required');
  }
  if(signingKey === undefined || signingKey === null) {
    throw new Error('signJarJwt: signingKey is required');
  }
  if(typeof signingKey !== 'object' || Array.isArray(signingKey)) {
    throw new Error('signJarJwt: signingKey is required');
  }
  if(typeof signingKey.privateKeyPem !== 'string') {
    throw new Error('signJarJwt: signingKey.privateKeyPem must be a string');
  }
  if(typeof signingKey.type !== 'string') {
    throw new Error('signJarJwt: signingKey.type must be a string');
  }
  if(typeof kid !== 'string') {
    throw new Error('signJarJwt: kid is required');
  }

  const privateKey = await importPKCS8(
    signingKey.privateKeyPem, signingKey.type);

  const useSigningMetadata = signingMetadata != null &&
    typeof signingMetadata === 'object' &&
    !Array.isArray(signingMetadata);

  const hasX5c = useSigningMetadata &&
    Array.isArray(signingMetadata.x5c) && signingMetadata.x5c.length > 0;

  const protectedHeader = useSigningMetadata ? {
    alg: signingMetadata.alg,
    typ: OID4VP_AUTHZ_REQ_JWT_TYP,
    ...(hasX5c ?
      {x5c: signingMetadata.x5c} :
      {kid: signingMetadata.kid})
  } : {
    alg: signingKey.type,
    kid,
    typ: OID4VP_AUTHZ_REQ_JWT_TYP
  };

  return new SignJWT(authorizationRequest)
    .setProtectedHeader(protectedHeader)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(privateKey);
}
