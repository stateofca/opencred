/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  generateAuthorizationRequest as generateAnnexB,
  handleAuthorizationResponse as handleAnnexB
} from '../profiles/native-18013-7-annex-b.js';
import {
  generateAuthorizationRequest as generateAnnexC,
  handleAuthorizationResponse as handleAnnexC
} from '../profiles/native-18013-7-annex-c.js';
import {
  generateAuthorizationRequest as generateAnnexD,
  handleAuthorizationResponse as handleAnnexD
} from '../profiles/native-18013-7-annex-d.js';
import {
  generateAuthorizationRequest as generateCadmvAndroid,
  handleAuthorizationResponse as handleCadmvAndroid
} from '../profiles/native-cadmv-android.js';
import {
  generateAuthorizationRequest as generateGoogleWallet,
  handleAuthorizationResponse as handleGoogleWallet
} from '../profiles/native-google-wallet.js';
import {
  generateAuthorizationRequest as generateHaip,
  handleAuthorizationResponse as handleHaip
} from '../profiles/native-oid4vp-haip-1.0.js';
import {
  generateAuthorizationRequest as generateSpruceId,
  handleAuthorizationResponse as handleSpruceId
} from '../profiles/native-spruceid-18013-7.js';
import {
  generateAuthorizationRequest as generateStandard,
  handleAuthorizationResponse as handleStandard
} from '../profiles/native-oid4vp-standard.js';
import {config} from '@bedrock/core';

const REQUEST_HANDLERS = {
  'cadmv-android': generateCadmvAndroid,
  'cadmv-ios': generateAnnexC,
  'google-wallet': generateGoogleWallet,
  'apple-wallet': generateAnnexC,
  '18013-7-Annex-D': generateAnnexD,
  '18013-7-Annex-D-spruceid': generateSpruceId,
  '18013-7-Annex-C': generateAnnexC,
  '18013-7-Annex-C-spruceid': generateSpruceId,
  '18013-7-Annex-B': generateAnnexB,
  'OID4VP-HAIP-1.0': generateHaip
};

const RESPONSE_HANDLERS = {
  'cadmv-android': handleCadmvAndroid,
  'cadmv-ios': handleAnnexC,
  'google-wallet': handleGoogleWallet,
  'apple-wallet': handleAnnexC,
  '18013-7-Annex-D': handleAnnexD,
  '18013-7-Annex-D-spruceid': handleSpruceId,
  '18013-7-Annex-C': handleAnnexC,
  '18013-7-Annex-C-spruceid': handleSpruceId,
  '18013-7-Annex-B': handleAnnexB,
  'OID4VP-HAIP-1.0': handleHaip
};

/**
 * Resolve the request handler for a given profile.
 *
 * @param {object} options - Options.
 * @param {string} options.profile - Canonical profile identifier
 *   (output of identifyProfile).
 * @returns {Function} Async handler that accepts the full request options.
 */
export function getRequestHandler({profile} = {}) {
  return REQUEST_HANDLERS[profile] ?? generateStandard;
}

/**
 * Resolve the response handler for a given exchange.
 *
 * Reads `exchange.variables.profile` (stored during request generation).
 *
 * @param {object} options - Options.
 * @param {object} options.exchange - The exchange object.
 * @returns {Function} Async handler.
 */
export function getResponseHandler({exchange} = {}) {
  const profile = exchange?.variables?.profile;
  return RESPONSE_HANDLERS[profile] ?? handleStandard;
}

/**
 * Call the appropriate profile handler for authorization requests.
 *
 * @param {object} options - Options object.
 * @param {string} options.profile - Profile identifier (required).
 * @param {string} options.responseMode - Response mode (required).
 * @param {string} [options.clientIdScheme] - Client ID scheme
 *   (optional, defaults to 'did').
 * @param {object} options.workflow - The workflow configuration (required).
 * @param {object} options.exchange - The exchange object (required).
 * @param {string} options.requestUrl - The original request URL (required).
 * @param {string} [options.userAgent] - The user agent string (optional).
 * @param {Array} [options.signingKeys] - Signing keys array (optional).
 * @param {string} [options.walletNonce] - Wallet nonce from POST request
 *   (optional, per OID4VP 1.0 Section 5.10).
 * @param {boolean} [options.signed] - Request a signed JAR envelope when
 *   true (default false).
 * @returns {Promise<object>} Profile result; may include `dcApiRequest` wire
 *   envelope (`{protocol, data}`), `authorizationRequest`, `updatedExchange`,
 *   optional `signingMetadata`. Standard / draft-18 handlers omit
 *   `dcApiRequest` and rely on middleware JAR signing.
 */
export async function authorizationRequestForProfile({
  profile,
  responseMode,
  clientIdScheme,
  workflow,
  exchange,
  requestUrl,
  userAgent = '',
  signingKeys,
  walletNonce,
  signed
}) {
  const baseUri = config.server.baseUri;
  const keys = signingKeys !== undefined ?
    signingKeys : config.opencred.signingKeys;

  const handler = getRequestHandler({profile});
  return handler({
    workflow,
    exchange,
    requestUrl,
    userAgent,
    baseUri,
    signingKeys: keys,
    profile,
    responseMode,
    clientIdScheme: clientIdScheme ?? 'did',
    walletNonce,
    signed
  });
}

/**
 * Call the appropriate profile handler for authorization responses.
 *
 * @param {object} options - Options object.
 * @param {object} options.workflow - The workflow configuration (required).
 * @param {object} options.exchange - The exchange object (required).
 * @param {string} options.responseUrl - The response URL (required).
 * @param {object} options.responseBody - The response body from the client
 *   (required).
 * @returns {Promise<object>} Object containing updatedExchange.
 */
export async function authorizationResponseForProfile({
  workflow,
  exchange,
  responseUrl,
  responseBody
}) {
  const hasAuthzRequest = !!exchange.variables?.authorizationRequest;
  const hasDcApiSession = !!exchange.variables?.dcApiSession;
  if(!hasAuthzRequest && !hasDcApiSession) {
    throw new Error(
      'Authorization request not found in exchange variables'
    );
  }
  if(!exchange.variables?.profile) {
    throw new Error(
      'Profile not found in exchange variables'
    );
  }

  const handler = getResponseHandler({exchange});
  return handler({workflow, exchange, responseUrl, responseBody});
}
