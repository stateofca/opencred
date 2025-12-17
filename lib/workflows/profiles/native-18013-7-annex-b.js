/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';
import {createId} from '../../../common/utils.js';
import {domainToDidWeb} from '../../didWeb.js';
import {getInputDescriptors} from '../../../common/oid4vp.js';
import {handleVerifiedPresentation} from '../common.js';
import {verifySubmission} from './common-oid4vp.js';

/**
 * Generate authorization request for 18013-7-Annex-B profile
 * Annex-B uses OID4VP with mso_mdoc format and direct_post response mode
 * @param {Object} options - Options object
 * @param {Object} options.workflow - The workflow configuration
 * @param {Object} options.exchange - The exchange object
 * @param {string} options.requestUrl - The original request URL
 * @param {string} [options.userAgent] - The user agent string (optional)
 * @param {string} [options.baseUri] - Base URI (optional, derived from
 *   requestUrl if not provided)
 * @param {Array} [options.signingKeys] - Signing keys array (optional)
 * @param {string} options.profile - OID4VP profile identifier
 *   (e.g. '18013-7-Annex-D')
 * @param {string} options.responseMode - Response mode (e.g. 'direct_post')
 * @returns {Promise<Object>} Object w/ authorizationRequest and updatedExchange
 */
export async function generateAuthorizationRequest({
  workflow,
  exchange,
  requestUrl,
  baseUri,
  responseMode
}) {
  // Use passed baseUri (which is config.server.baseUri) for server identity
  // This ensures client_id always represents the canonical server identity
  const serverBaseUri = baseUri || config.server.baseUri;
  // Annex-B uses presentation_definition with mso_mdoc format
  const inputDescriptors = await getInputDescriptors({workflow});

  // Ensure mso_mdoc format is included in input descriptors
  const inputDescriptorsWithMdoc = await Promise.all(inputDescriptors.map(
    async descriptor => {
      const formats = descriptor.format || {};
      if(!formats.mso_mdoc) {
        formats.mso_mdoc = {
          alg: ['ES256']
        };
      }
      return {
        ...descriptor,
        format: formats
      };
    }
  ));

  const presentationDefinition = {
    id: await createId(),
    input_descriptors: inputDescriptorsWithMdoc
  };

  // Build client_metadata with mso_mdoc support
  const clientMetadata = {
    client_name: 'OpenCred Verifier',
    subject_syntax_types_supported: [
      'did:jwk', 'did:key', 'did:web'
    ],
    vp_formats: {
      mso_mdoc: {
        alg: ['ES256']
      }
    }
  };

  const authorizationRequest = {
    response_type: 'vp_token',
    response_mode: responseMode || 'direct_post',
    client_id: domainToDidWeb(serverBaseUri),
    client_id_scheme: 'did',
    nonce: exchange.challenge,
    response_uri: `${serverBaseUri}${requestUrl.replace(
      'request', 'response')}`,
    state: await createId(),
    presentation_definition: presentationDefinition,
    client_metadata: clientMetadata
  };

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

  return {
    authorizationRequest,
    updatedExchange
  };
}

/**
 * Handle authorization response for 18013-7-Annex-B profile
 * Annex-B uses OID4VP with mso_mdoc format and direct_post response mode
 * @param {Object} options - Options object
 * @param {Object} options.workflow - The workflow configuration
 * @param {Object} options.exchange - The exchange object
 * @param {string} options.responseUrl - The response URL (unused)
 * @param {Object} options.responseBody - The response body from the client
 * @returns {Promise<Object>} Object containing updatedExchange
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

  // Annex-B uses direct_post, so extract vp_token and presentation_submission
  const vpToken = responseBody.vp_token;
  const submission = typeof responseBody.presentation_submission === 'string' ?
    JSON.parse(responseBody.presentation_submission) :
    responseBody.presentation_submission;

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

