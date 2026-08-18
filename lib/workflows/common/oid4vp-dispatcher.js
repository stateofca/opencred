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
import {
  hasResponseState,
  hydratePendingRequest,
  readPendingRequests
} from './dc-api-pending-requests.js';
import {
  resolvePendingDcApiRequest,
  responseJweKid,
  responseProtocol
} from './dc-api-response-resolver.js';
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
 * Reads `exchange.variables.profile`. Callers pass the exchange **after**
 * `hydratePendingRequest` has restored the matched pending request, so this is
 * the profile that the wallet actually answered rather than whichever request
 * happened to be issued last.
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
 * @param {string} [options.declaredProfile] - Profile the client believes
 *   answered. A hint used only to narrow among pending requests that already
 *   agree with the response protocol; it can never override that match.
 * @returns {Promise<object>} Object containing updatedExchange.
 */
export async function authorizationResponseForProfile({
  workflow,
  exchange,
  responseUrl,
  responseBody,
  declaredProfile
}) {
  // An exchange can hold a pending request per profile, because one
  // `navigator.credentials.get()` call may carry several. Pick the one this
  // response answers, then restore it into the flat `exchange.variables` shape
  // the profile response handlers read, so those handlers need no knowledge
  // that multi-profile requests exist.
  const pending = readPendingRequests({exchange});
  const protocol = responseProtocol(responseBody);
  let entry = null;
  let matchedBy = null;

  if(pending.length > 0 && !pending[0].legacy) {
    // A real multi-profile DC API pending set is present. It answers only a DC
    // API response — one carrying a recognized `protocol` marker. A response
    // without one (a `direct_post` form body from a non-DC-API fallback served
    // on this same exchange) must never be attributed to a spent DC API offer:
    // leave `entry` null so it resolves against the flat request state below,
    // exactly as it would on an exchange that never saw a DC API attempt.
    if(protocol) {
      ({entry, matchedBy} = resolvePendingDcApiRequest({
        pending,
        protocol,
        declaredProfile,
        jweKid: responseJweKid(responseBody)
      }));
    }
  } else if(pending.length > 0) {
    // Legacy flat-slot exchange: the single synthesized entry is the flat
    // state, hydration is a no-op, and there is nothing to disambiguate.
    [entry] = pending;
    matchedBy = 'legacy';
  }

  const resolvedExchange = entry ?
    hydratePendingRequest({exchange, entry}) : exchange;

  if(!hasResponseState({variables: resolvedExchange.variables})) {
    throw new Error(
      'Authorization request not found in exchange variables'
    );
  }
  if(!resolvedExchange.variables?.profile) {
    throw new Error(
      'Profile not found in exchange variables'
    );
  }

  const handler = getResponseHandler({exchange: resolvedExchange});
  const result = await handler({
    workflow, exchange: resolvedExchange, responseUrl, responseBody
  });
  // `profile`, `protocol`, and `requestGroupId` are surfaced so the caller can
  // record which profile actually answered without re-deriving it.
  return {
    ...result,
    profile: resolvedExchange.variables?.profile,
    protocol,
    requestGroupId: entry?.requestGroupId ?? null,
    matchedBy
  };
}
