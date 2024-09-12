/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  createPresentation,
  issue,
  signPresentation,
  verify,
  verifyCredential
} from '@digitalbazaar/vc';
import {
  verifyCredential as verifyCredentialJWT,
  verifyPresentation as verifyPresentationJWT
} from 'did-jwt-vc';
import base64url from 'base64url';
import {ConfidentialClientApplication} from '@azure/msal-node';
import {decodeJwt} from 'jose';
import {didResolver} from './documentLoader.js';
import {generateId} from 'bnid';
import {httpClient} from '@digitalbazaar/http-client';
import {logger} from '../lib/logger.js';
import {verifyChain} from './x509.js';

// General Utilities

export const createId = async (bitLength = 128) => {
  const id = await generateId({
    bitLength,
    encoding: 'base58',
    multibase: true,
    multihash: true
  });
  return id;
};

export const isValidJwt = jwt => {
  try {
    decodeJwt(jwt);
    return true;
  } catch(error) {
    return false;
  }
};

export const isValidJson = json => {
  if(typeof json === 'object') {
    return !Array.isArray(json);
  }
  try {
    if(typeof json === 'string') {
      JSON.parse(json);
      return true;
    }
    return false;
  } catch(error) {
    return false;
  }
};

export const getValidJson = json => {
  if(typeof json === 'object') {
    if(Array.isArray(json)) {
      return null;
    }
    return json;
  }
  try {
    if(typeof json === 'string') {
      return JSON.parse(json);
    }
    return null;
  } catch(error) {
    return null;
  }
};

const _convertJwtVcTokenToDiVcs = vcTokens => {
  return vcTokens.map(t => decodeJwt(t).vc);
};

export const convertJwtVpTokenToDiVp = vpToken => {
  const decodedVpPayloadWithEncodedVcs = decodeJwt(vpToken).vp;
  const decodedVpPayload = {
    ...decodedVpPayloadWithEncodedVcs,
    verifiableCredential: _convertJwtVcTokenToDiVcs(
      decodedVpPayloadWithEncodedVcs.verifiableCredential
    )
  };
  return decodedVpPayload;
};

export const normalizeVpTokenDataIntegrity = vpToken => {
  if(typeof vpToken === 'string') {
    try {
      return [JSON.parse(vpToken)];
    } catch(e) {
      return null;
    }
  }

  if(typeof vpToken === 'object' && !Array.isArray(vpToken)) {
    return [vpToken];
  }

  if(Array.isArray(vpToken)) {
    return vpToken.map(item => {
      if(typeof item === 'string') {
        try {
          return JSON.parse(base64url.decode(item));
        } catch(e) {
          logger.error('vp_token contains invalid Base64 encoded JSON.');
          return null;
        }
      } else {
        return item;
      }
    });
  }

  logger.error('vp_token format is not recognized.');
  return null;
};

// Verify Utilities

const verifyJWTVC = async (jwt, options = {}) => {
  const {
    resolver,
    ...optionsWithoutResolver
  } = options;
  try {
    const verification = await verifyCredentialJWT(
      jwt,
      resolver ?
        {resolve: did => resolver.resolve(did)} :
        {resolve: did => didResolver.get({did})},
      optionsWithoutResolver
    );
    return {...verification, errors: []};
  } catch(e) {
    return {verified: false, errors: [e.message]};
  }
};

const verifyJWTVP = async (jwt, options = {}) => {
  const {
    resolver,
    ...optionsWithoutResolver
  } = options;
  try {
    const verification = await verifyPresentationJWT(
      jwt,
      resolver ?
        {resolve: did => resolver.resolve(did)} :
        {resolve: did => didResolver.get({did})},
      optionsWithoutResolver
    );
    return {...verification, errors: []};
  } catch(e) {
    return {verified: false, errors: [e.message]};
  }
};

const getVerifyPresentationDiError = vpResult => {
  if(vpResult.error) {
    return vpResult.error;
  }

  const vpErrorMessage = vpResult.presentationResult.results
    .filter(result => !result.verified)
    .map(result => result.error?.message)
    .join(', ');

  const vcErrorMessage = vpResult.credentialResults
    .filter(result => !result.verified)
    .map(result => {
      return result.results
        .filter(result => !result.verified)
        .map(result => result.error.message);
    })
    .reduce((accumulatedMessages, currentMessages) =>
      accumulatedMessages.concat(currentMessages))
    .join(', ');

  return 'PresentationVerificationError: ' +
    `${/\S/.test(vpErrorMessage) ? vpErrorMessage : 'None'}; ` +
    'CredentialVerificationError: ' +
    `${/\S/.test(vcErrorMessage) ? vcErrorMessage : 'None'}`;
};

export const verifyUtils = {
  verifyPresentationDataIntegrity: async options => verify(options),
  verifyCredentialDataIntegrity: async options => verifyCredential(options),
  verifyPresentationJWT: async (jwt, options) => verifyJWTVP(jwt, options),
  verifyCredentialJWT: async (jwt, options) => verifyJWTVC(jwt, options),
  verifyx509JWT: async (certs, options) => verifyChain(certs, options),
  getVerifyPresentationDataIntegrityErrors:
    vpResult => getVerifyPresentationDiError(vpResult)
};

// Sign Utilities

export const signUtils = {
  createPresentationDataIntegrity: args => createPresentation(args),
  signPresentationDataIntegrity: async args => signPresentation(args),
  signCredentialDataIntegrity: async args => issue(args)
};

export function asyncHandler(middleware) {
  return function asyncMiddleware(...args) {
    const result = middleware(...args);
    const next = args[args.length - 1];
    const handleError = (...args) => {
      logger.error(...args);
      process.nextTick(() => next([]));
    };
    return Promise.resolve(result).catch(handleError);
  };
}

// MSAL Client Utilities

const MSAL_ACCESS_TOKEN_REQUEST_SCOPE =
  '3db474b9-6a0c-4840-96ac-1fceb342124f/.default';

const getMsalClient = relyingParty => {
  const {
    apiLoginBaseUrl,
    apiClientId,
    apiClientSecret,
    apiTenantId
  } = relyingParty.workflow;
  const msalConfig = {
    auth: {
      clientId: apiClientId,
      clientSecret: apiClientSecret,
      authority: `${apiLoginBaseUrl}/${apiTenantId}`
    }
  };
  try {
    return new ConfidentialClientApplication(msalConfig);
  } catch(error) {
    throw new Error(
      'Error creating MSAL client:\n' +
      error.message
    );
  }
};

const acquireAccessToken = async msalClient => {
  const tokenRequest = {
    scopes: [MSAL_ACCESS_TOKEN_REQUEST_SCOPE],
  };
  try {
    return msalClient.acquireTokenByClientCredential(tokenRequest);
  } catch(error) {
    throw new Error(
      'Error acquiring MSAL access token:\n' +
      error.message
    );
  }
};

const makeHttpPostRequest = async ({msalClient, url, data}) => {
  const {accessToken} = await acquireAccessToken(msalClient);
  const headers = {Authorization: `Bearer ${accessToken}`};
  const client = httpClient.extend({headers});
  try {
    return client.post(
      url, {json: data}
    );
  } catch(error) {
    throw new Error(
      'Error making MSAL authenticated HTTP POST request:\n' +
      error.message
    );
  }
};

export const msalUtils = {
  getMsalClient,
  acquireAccessToken,
  makeHttpPostRequest
};

// Presentation Logging Utilities

// Domain of values for presentation event
const PresentationEvent = {
  PresentationStart: 'presentation_start',
  PresentationSuccess: 'presentation_success',
  PresentationError: 'presentation_error'
};

const getPresentationEvent = (eventType, clientId, exchangeId, error) => {
  return {
    type: eventType,
    clientId: clientId ?? 'unknown',
    exchangeId: exchangeId ?? 'unknown',
    error
  };
};

/**
 * Gets a consistent presentation start event object.
 * @param {string | undefined} clientId the relying party identifier
 * @returns {object}
 */
const presentationStart = (clientId, exchangeId) => {
  return getPresentationEvent(
    PresentationEvent.PresentationStart, clientId, exchangeId);
};

/**
 * Gets a consistent presentation success event object.
 * @param {string | undefined} clientId the relying party identifier
 * @returns {object}
 */
const presentationSuccess = (clientId, exchangeId) => {
  return getPresentationEvent(
    PresentationEvent.PresentationSuccess, clientId, exchangeId);
};

/**
 * Gets a consistent presentation error event object.
 * @param {string | undefined} clientId the relying party identifier
 * @returns {object}
 */
const presentationError = (clientId, exchangeId, error) => {
  return getPresentationEvent(
    PresentationEvent.PresentationError, clientId, exchangeId, error);
};

export const logEvents = {
  presentationStart,
  presentationSuccess,
  presentationError
};
