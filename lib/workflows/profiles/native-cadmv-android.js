/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {_buildDcqlQueryForMdoc, _getX5cFromSigningKey} from
  '../common/oid4vp-shared.js';
import {buildAnnexDDcApiRequest} from '../common/dc-api-envelope.js';
import {buildClientMetadata} from '../common/client-metadata.js';
import {config} from '@bedrock/core';
import {createId} from '../../../common/utils.js';
import {encodeSessionTranscript} from '../common/session-transcript.js';
import {signJarJwt} from '../common/jar-signing.js';

// Response handling is structurally identical to Annex D (unencrypted
// dc_api vp_token with base64url DeviceResponse).
export {handleAuthorizationResponse} from './native-18013-7-annex-d.js';

/**
 * Generate a signed authorization request for the CA DMV Android wallet
 * (sprucekit-mobile 0.15.3+).
 *
 * Wire format matches the openid4vp crate at rev 6127287.
 * - Protocol: openid4vp-v1-signed (JAR)
 * - client_id_scheme: x509_san_dns
 * - client_metadata.vp_formats.mso_mdoc.alg: ["ES256"]
 * - No state, no multiple, no require_cryptographic_holder_binding.
 *
 * @param {object} options - Options object.
 * @param {object} options.workflow - The workflow configuration.
 * @param {object} options.exchange - The exchange object.
 * @param {string} [options.baseUri] - Base URI.
 * @param {Array} [options.signingKeys] - Signing keys array.
 * @param {string} options.profile - Should be 'cadmv-android'.
 * @param {string} [options.walletNonce] - Wallet nonce (OID4VP 1.0 §5.10).
 * @returns {Promise<object>} Object containing authorizationRequest,
 *   dcApiRequest, updatedExchange, and signingMetadata.
 */
export async function generateAuthorizationRequest({
  workflow,
  exchange,
  baseUri,
  signingKeys,
  profile,
  walletNonce
}) {
  const serverBaseUri = baseUri || config.server.baseUri;
  const keys = signingKeys !== undefined ?
    signingKeys : config.opencred.signingKeys;

  const signingKey = keys.find(k =>
    k.purpose?.includes('authorization_request')
  );
  if(!signingKey) {
    throw new Error('No signing key with purpose authorization_request found');
  }

  const url = new URL(serverBaseUri);
  const hostname = url.hostname;
  const clientId = `x509_san_dns:${hostname}`;

  const dcql_query = await _buildDcqlQueryForMdoc({
    workflow, exchange, profile
  });

  const client_metadata = buildClientMetadata({profile: 'cadmv-android'});

  const x5c = _getX5cFromSigningKey(signingKey);

  const authorizationRequest = {
    client_id: clientId,
    client_id_scheme: 'x509_san_dns',
    response_type: 'vp_token',
    response_mode: 'dc_api',
    expected_origins: [serverBaseUri],
    nonce: exchange.challenge || await createId(),
    dcql_query,
    client_metadata,
    ...(walletNonce && {wallet_nonce: walletNonce})
  };

  const encodedSessionTranscript = encodeSessionTranscript({
    responseMode: 'dc_api',
    origin: serverBaseUri,
    nonce: authorizationRequest.nonce,
    jwkThumbprint: null
  });

  const signingMetadata = {
    x5c,
    alg: signingKey.type
  };

  const signedJwt = await signJarJwt({
    authorizationRequest,
    signingKey,
    kid: `${hostname}#${signingKey.id}`,
    signingMetadata
  });
  const dcApiRequest = buildAnnexDDcApiRequest({signed: true, signedJwt});

  const updatedExchange = {
    ...exchange,
    state: 'active',
    updatedAt: new Date(),
    variables: {
      ...exchange.variables,
      profile,
      authorizationRequest,
      encodedSessionTranscript
    }
  };

  return {
    authorizationRequest,
    dcApiRequest,
    updatedExchange,
    signingMetadata
  };
}
