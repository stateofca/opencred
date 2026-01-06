/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  generateAuthorizationRequest as generateAnnexB,
  handleAuthorizationResponse as handleAnnexB
} from './native-18013-7-annex-b.js';
import {
  generateAuthorizationRequest as generateAnnexC,
  handleAuthorizationResponse as handleAnnexC
} from './native-18013-7-annex-c.js';
import {
  generateAuthorizationRequest as generateAnnexD,
  handleAuthorizationResponse as handleAnnexD
} from './native-18013-7-annex-d.js';
import {
  generateAuthorizationRequest as generateHaip,
  handleAuthorizationResponse as handleHaip
} from './native-oid4vp-haip-1.0.js';
import {
  generateAuthorizationRequest as generateSpruceId,
  handleAuthorizationResponse as handleSpruceId
} from './native-spruceid-18013-7.js';
import {
  generateAuthorizationRequest as generateStandard,
  handleAuthorizationResponse as handleStandard
} from './native-oid4vp-standard.js';
import {config} from '@bedrock/core';

/**
 * Internal function to determine handler name from profile and workflow
 * @param {string} profile - Profile identifier
 * @param {Object} workflow - The workflow configuration
 * @returns {string} Handler name
 */
function _determineHandlerName(profile, workflow) {
  // Handle 18013-7-Annex-D and 18013-7-Annex-C profile refinement
  // Check if dcApiNamespaceQuery is present at workflow level
  if(['18013-7-Annex-D', '18013-7-Annex-C'].includes(profile) &&
     workflow?.dcApiNamespaceQuery) {
    return 'spruceid';
  }

  // Map profile to handler
  if(profile === '18013-7-Annex-D-spruceid' ||
     profile === '18013-7-Annex-C-spruceid') {
    return 'spruceid';
  } else if(profile === '18013-7-Annex-D') {
    return '18013-7-annex-d';
  } else if(profile === '18013-7-Annex-C') {
    return '18013-7-annex-c';
  } else if(profile === '18013-7-Annex-B') {
    return '18013-7-annex-b';
  } else if(profile === 'OID4VP-HAIP-1.0') {
    return 'haip';
  } else if(profile?.startsWith('18013-7-')) {
    return '18013-7-annex-d';
  }

  // Default to standard handler
  return 'standard';
}

/**
 * Internal function to determine handler name from authorization request
 * @param {Object} authorizationRequest - The authorization request object
 * @param {Object} workflow - The workflow configuration
 * @param {Object} [exchange] - The exchange object (optional, for Annex C
 *   detection)
 * @returns {string} Handler name
 */
function _determineHandlerFromRequest(
  authorizationRequest, workflow, exchange) {
  const responseMode = authorizationRequest.response_mode;

  if(!!workflow?.dcApiNamespaceQuery) {
    // SpruceID handler when dcApiNamespaceQuery is present
    return 'spruceid';
  } else if(authorizationRequest.dcql_query &&
            authorizationRequest.client_id_scheme === 'x509_san_dns') {
    // Annex-C, Annex-D, or HAIP handler (uses x509_san_dns and dcql_query)
    // Check exchange variables to detect Annex C (has HPKE keys)
    if(exchange?.variables?.hpkeRecipientPrivateKey ||
       exchange?.variables?.base64EncryptionInfo) {
      // Annex-C uses HPKE encryption
      return '18013-7-annex-c';
    }

    if(responseMode === 'dc_api.jwt' &&
       authorizationRequest.client_metadata?.vp_formats_supported) {
      // HAIP uses vp_formats_supported (not vp_formats)
      return 'haip';
    } else if(responseMode === 'dc_api' ||
              responseMode === 'dc_api.jwt') {
      // Annex-D uses dc_api response mode
      return '18013-7-annex-d';
    } else if(responseMode === 'direct_post' &&
              authorizationRequest.presentation_definition) {
      // Annex-B uses direct_post with presentation_definition
      return '18013-7-annex-b';
    }
  } else if(authorizationRequest.presentation_definition &&
            authorizationRequest.client_metadata?.vp_formats?.mso_mdoc) {
    // Annex-B uses presentation_definition with mso_mdoc format
    return '18013-7-annex-b';
  }

  // Standard OID4VP (draft-18, 1.0, combined)
  return 'standard';
}

/**
 * Helper function to call the appropriate profile handler for
 * authorization requests
 * @param {Object} options - Options object
 * @param {string} options.profile - Profile identifier (required)
 * @param {string} options.responseMode - Response mode (required)
 * @param {string} [options.clientIdScheme] - Client ID scheme
 *   (optional, defaults to 'did')
 * @param {Object} options.workflow - The workflow configuration (required)
 * @param {Object} options.exchange - The exchange object (required)
 * @param {string} options.requestUrl - The original request URL (required)
 * @param {string} [options.userAgent] - The user agent string (optional)
 * @param {Array} [options.signingKeys] - Signing keys array (optional)
 * @returns {Promise<Object>} Object containing result and signingMetadata
 */
export async function authorizationRequestForProfile({
  profile,
  responseMode,
  clientIdScheme,
  workflow,
  exchange,
  requestUrl,
  userAgent = '',
  signingKeys
}) {
  // Always use config.server.baseUri for server identity
  // This ensures client_id always represents the canonical server identity,
  // which is important for both production and test scenarios
  const baseUri = config.server.baseUri;

  // Use signingKeys from parameter or fall back to config
  const keys = signingKeys !== undefined ?
    signingKeys : config.opencred.signingKeys;

  // Determine handler name internally
  const handlerName = _determineHandlerName(profile, workflow);

  const handlers = {
    spruceid: generateSpruceId,
    '18013-7-annex-b': generateAnnexB,
    '18013-7-annex-c': generateAnnexC,
    '18013-7-annex-d': generateAnnexD,
    haip: generateHaip,
    standard: generateStandard
  };

  const handler = handlers[handlerName] ?? handlers.standard;
  const result = await handler({
    workflow,
    exchange,
    requestUrl,
    userAgent,
    baseUri,
    signingKeys: keys,
    profile,
    responseMode,
    clientIdScheme: clientIdScheme ?? 'did'
  });
  // {
  //  authorizationRequest,
  //  authorizationRequestJwt?,
  //  updatedExchange,
  //  signingMetadata?
  // }
  return result;
}

/**
 * Helper function to call the appropriate profile handler for
 * authorization responses
 * @param {Object} options - Options object
 * @param {Object} options.workflow - The workflow configuration (required)
 * @param {Object} options.exchange - The exchange object (required)
 * @param {string} options.responseUrl - The response URL (required)
 * @param {Object} options.responseBody - The response body from the client
 *   (required)
 * @returns {Promise<Object>} Object containing updatedExchange
 */
export async function authorizationResponseForProfile({
  workflow,
  exchange,
  responseUrl,
  responseBody
}) {
  // Extract authorization request from exchange to determine handler
  const authorizationRequest = exchange.variables?.authorizationRequest;
  if(!authorizationRequest) {
    throw new Error(
      'Authorization request not found in exchange variables'
    );
  }

  // Determine handler name internally from authorization request
  const handlerName = _determineHandlerFromRequest(
    authorizationRequest, workflow, exchange);

  const handlers = {
    spruceid: handleSpruceId,
    '18013-7-annex-b': handleAnnexB,
    '18013-7-annex-c': handleAnnexC,
    '18013-7-annex-d': handleAnnexD,
    haip: handleHaip,
    standard: handleStandard
  };

  const handler = handlers[handlerName] ?? handlers.standard;

  const handlerOptions = {
    workflow,
    exchange,
    responseUrl,
    responseBody
  };

  const result = await handler(handlerOptions);
  // {
  //  updatedExchange
  // }
  return result;
}
