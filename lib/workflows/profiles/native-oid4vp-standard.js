/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  _getX5cFromSigningKey,
  verifySubmission
} from './common-oid4vp.js';
import {
  getClientMetadata,
  getDcqlQuery,
  getPresentationDefinition
} from '../../../common/oid4vp.js';
import {importJWK, jwtDecrypt} from 'jose';
import {config} from '@bedrock/core';
import {createId} from '../../../common/utils.js';
import {domainToDidWeb} from '../../didWeb.js';
import {handleVerifiedPresentation} from '../common.js';

/**
 * Generate authorization request for standard OID4VP profiles.
 *
 * @param {object} options - Options object.
 * @param {object} options.workflow - The workflow configuration.
 * @param {object} options.exchange - The exchange object.
 * @param {string} options.requestUrl - The original request URL.
 * @param {string} [options.userAgent] - The user agent string (optional).
 * @param {string} [options.baseUri] - Base URI (optional, derived from
 *   requestUrl if not provided).
 * @param {Array} [options.signingKeys] - Signing keys array (optional).
 * @param {string} options.profile - OID4VP sub-profile identifier.
 * @param {string} options.responseMode - OID4VP Response mode.
 * @param {string} [options.clientIdScheme] - Client ID scheme (optional,
 *   defaults to 'did').
 * @returns {Promise<object>} Object w/ authorizationRequest, updatedExchange,
 *   and optionally signingMetadata.
 */
export async function generateAuthorizationRequest({
  workflow,
  exchange,
  requestUrl,
  // eslint-disable-next-line no-unused-vars
  userAgent = '',
  baseUri,
  signingKeys,
  profile,
  responseMode,
  clientIdScheme = 'did'
}) {
  // Use passed baseUri (which is config.server.baseUri) for server identity
  // This ensures client_id always represents the canonical server identity
  const serverBaseUri = baseUri || config.server.baseUri;

  // Compose authorization request from component functions
  const [
    presentationDefinition,
    dcqlQueryComponent,
    clientMetadata
  ] = await Promise.all([
    getPresentationDefinition({
      workflow,
      exchange,
      domain: serverBaseUri,
      url: requestUrl,
      profile
    }),
    getDcqlQuery({
      workflow, profile}),
    getClientMetadata({profile})
  ]);

  // Determine client_id and client_id_scheme based on clientIdScheme parameter
  let clientId;
  let signingMetadata;

  if(clientIdScheme === 'x509_san_dns') {
    // Extract hostname from baseUri for x509_san_dns client_id
    const url = new URL(serverBaseUri);
    const hostname = url.hostname;
    clientId = `x509_san_dns:${hostname}`;

    // Get signing key for x509_san_dns scheme
    const keys = signingKeys !== undefined ?
      signingKeys : config.opencred.signingKeys;
    const signingKey = keys.find(k =>
      k.purpose?.includes('authorization_request'));
    if(!signingKey) {
      throw new Error(
        'No signing key with purpose authorization_request found');
    }

    // Get x5c certificate chain
    const x5c = _getX5cFromSigningKey(signingKey);

    // Return signing metadata for JWT signing
    signingMetadata = {
      x5c,
      kid: `${hostname}#${signingKey.id}`,
      alg: signingKey.type
    };
  } else {
    // Default to 'did' scheme
    clientId = domainToDidWeb(serverBaseUri);
  }

  const authorizationRequest = {
    response_type: 'vp_token',
    response_mode: responseMode,
    client_id: clientId,
    client_id_scheme: clientIdScheme,
    nonce: exchange.challenge,
    response_uri: `${serverBaseUri}${requestUrl.replace(
      'request', 'response')}`,
    state: await createId(),
    ...presentationDefinition,
    ...dcqlQueryComponent,
    ...clientMetadata
  };

  // Add expected_origins for DC API signed requests
  // (required per OID4VP 1.0 A.2)
  if(responseMode === 'dc_api' || responseMode === 'dc_api.jwt') {
    authorizationRequest.expected_origins = [serverBaseUri];
  }

  // Update exchange with authorization request
  const updatedExchange = {
    ...exchange,
    state: 'active',
    updatedAt: new Date(),
    variables: {
      ...exchange.variables,
      authorizationRequest
    }
  };

  const result = {
    authorizationRequest,
    updatedExchange,
    ...(signingMetadata ? {signingMetadata} : {})
  };
  return result;
}

/**
 * Handle authorization response for standard OID4VP profiles.
 *
 * @param {object} options - Options object.
 * @param {object} options.workflow - The workflow configuration.
 * @param {object} options.exchange - The exchange object.
 * @param {string} options.responseUrl - The response URL (unused).
 * @param {object} options.responseBody - The response body from the client.
 * @returns {Promise<object>} Object containing updatedExchange.
 */
export async function handleAuthorizationResponse({
  workflow,
  exchange,
  // eslint-disable-next-line no-unused-vars
  responseUrl,
  responseBody
}) {
  const authorizationRequest = exchange.variables?.authorizationRequest;
  if(!authorizationRequest) {
    throw new Error('Authorization request not found in exchange variables');
  }

  const responseMode = authorizationRequest.response_mode;

  // Handle dc_api.jwt (encrypted response)
  if(responseMode === 'dc_api.jwt') {
    const privateKeyJwk =
      exchange.variables?.ephemeralKeyAgreementPrivateKey;
    if(!privateKeyJwk) {
      throw new Error(
        'Ephemeral key agreement private key not found ' +
        'for dc_api.jwt response'
      );
    }

    // Decrypt JWT response
    const jwt = responseBody.response || responseBody;
    if(typeof jwt !== 'string') {
      throw new Error('Expected JWT string in response body');
    }

    // Import the private key JWK for decryption
    const privateKey = await importJWK(privateKeyJwk, 'ECDH-ES');

    const result = await jwtDecrypt(jwt, privateKey, {
      contentEncryptionAlgorithms: ['A128GCM', 'A256GCM'],
      keyManagementAlgorithms: ['ECDH-ES']
    });
    responseBody = result.payload;
  }

  // Handle dc_api response (unencrypted, may come as JSON from DC API)
  // Extract vp_token and presentation_submission
  let vpToken;
  let submission;

  if(responseMode === 'dc_api' || responseMode === 'dc_api.jwt') {
    vpToken = responseBody.vp_token || responseBody.data?.vp_token;
    submission = responseBody.presentation_submission ||
      responseBody.data?.presentation_submission ||
      (typeof responseBody.presentation_submission === 'string' ?
        JSON.parse(responseBody.presentation_submission) :
        responseBody.presentation_submission);
  } else {
    // direct_post mode
    vpToken = responseBody.vp_token;
    submission =
      typeof responseBody.presentation_submission === 'string' ?
        JSON.parse(responseBody.presentation_submission) :
        responseBody.presentation_submission;
  }

  if(!vpToken) {
    throw new Error('vp_token not found in response');
  }

  // Verify the submission
  const verificationResult = await verifySubmission({
    workflow,
    vp_token: vpToken,
    submission,
    exchange,
    baseUri: config.server.baseUri
  });
  const verified = verificationResult.verified;
  const errors = verificationResult.errors || [];
  const verifiablePresentation = verificationResult.verifiablePresentation;

  if(!verified) {
    // Failed verification - return error with errors array
    // Middleware will handle database persistence
    const error = new Error('Verification failed');
    error.errors = errors;
    throw error;
  }

  // Success: update exchange
  const updatedExchange = await handleVerifiedPresentation({
    exchange,
    verifiablePresentation,
    vpToken
  });

  return {
    updatedExchange
  };
}

