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
import {
  checkStatus as checkStatusBitstring
} from '@digitalbazaar/vc-bitstring-status-list';
import {ConfidentialClientApplication} from '@azure/msal-node';
import {decodeJwt} from 'jose';
import {didResolver} from './documentLoader.js';
import {generateId} from 'bnid';
import {httpClient} from '@digitalbazaar/http-client';
import {logger} from '../lib/logger.js';
import {verifyChain} from './x509.js';

// General Utilities

export const arrayOf = value => {
  if(Array.isArray(value)) {
    return value;
  }
  if(value) {
    return [value];
  }
  return [];
};

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

const _unenvelopeVcJwtVc = vcTokens => {
  return vcTokens.map(t => {
    if(typeof t === 'object') {
      const credentialId = t.id ?? t['@id'];
      // Handle EnvelopedVerifiableCredential
      if(typeof credentialId === 'string' &&
          credentialId.startsWith('data:application/jwt')) {
        return decodeJwt(credentialId.split(',')[1]).vc;
      }
      // VerifiableCredential already decoded
      return t;
    }
    // JWT in Compact Serialization
    return decodeJwt(t).vc;
  });
};

export const unenvelopeJwtVp = vpToken => {
  const decodedVpPayloadWithEncodedVcs = decodeJwt(vpToken).vp;
  const decodedVpPayload = {
    ...decodedVpPayloadWithEncodedVcs,
    verifiableCredential: _unenvelopeVcJwtVc(
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

const SUPPORTED_STATUS_ENTRY_TYPES = [
  'BitstringStatusListEntry',
];

const checkStatus = async options => {
  const {credential} = options;
  const statuses = arrayOf(credential?.credentialStatus);

  if(!statuses.length) {
    return {verified: true};
  }

  const statusEntryTypes = statuses.map(
    status => arrayOf(status.type)
  ).flat();
  if(statusEntryTypes.find(tt => !SUPPORTED_STATUS_ENTRY_TYPES.includes(tt))) {
    return {
      verified: false,
      errors: [
        `Unsupported status entry type(s): ${
          statusEntryTypes
            .filter(tt => !SUPPORTED_STATUS_ENTRY_TYPES.includes(tt))
            .join(', ')}`]
    };
  }

  return checkStatusBitstring(options);
};

const verifyJWTVC = async (jwt, options = {}) => {
  const {
    checkStatus,
    resolver,
    ...restOptions
  } = options;
  try {
    const verification = await verifyCredentialJWT(
      jwt,
      resolver ?
        {resolve: did => resolver.resolve(did)} :
        {resolve: did => didResolver.get({
          did, verificationMethodType: 'JsonWebKey2020'})},
      restOptions
    );
    if(verification.verified && checkStatus) {
      // Check status if available
      const vc = verification.verifiableCredential;
      const statusEntries = arrayOf(vc?.credentialStatus);
      // todo check if this location is match of LD tools.
      verification.statusResult = (statusEntries.length && statusEntries[0]) ?
        await checkStatus({credential: vc, ...restOptions}) : null;
      if(verification.statusResult && !verification.statusResult?.verified) {
        verification.verified = false;
        verification.errors = verification.errors ? verification.errors.concat(
          verification.statusResult.errors) : verification.statusResult.errors;
        return verification;
      }
    }
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
        {resolve: did => didResolver.get({
          did, verificationMethodType: 'JsonWebKey2020'})},
      optionsWithoutResolver
    );
    return {...verification, errors: []};
  } catch(e) {
    return {verified: false, errors: [e.message]};
  }
};

/**
 * Checks if a Verifiable Credential matches a Verifiable Presentation Request
 * @param vc - The Verifiable Credential to check
 * @param vpr - The Verifiable Presentation Request containing the query
 * @returns boolean - true if the VC matches the VPR
 */
function checkVcForVpr(vc, vpr) {
  // Extract the example from the VPR (only QueryByExample supported)
  if(!vpr.query?.type || vpr.query?.type !== 'QueryByExample') {
    return false;
  }
  const example = vpr.query.credentialQuery.example;

  // Only Context and Type fields are supported for QueryByExample
  // at this time.
  const expectedContext = arrayOf(example['@context']) || [];
  const expectedType = arrayOf(example.type) || [];

  if(expectedContext.length > 0) {
    // Check if the VC's context matches the expected context
    const vcContext = arrayOf(vc['@context']);
    if(!expectedContext.every(ctx => vcContext.includes(ctx))) {
      return false;
    }
  }
  if(expectedType.length > 0) {
    // Check if the VC's type matches the expected type
    const vcType = arrayOf(vc.type);
    if(!expectedType.every(type => vcType.includes(type))) {
      return false;
    }
  }

  return true;
}

const getVerifyPresentationDataIntegrityErrors = vpResult => {
  const vpErrorMessage = vpResult.presentationResult.results
    .filter(result => !result.verified)
    .map((result, i) => {
      return `${result.error?.message}${i === 0 ? ' (Presentation)' : ''}`;
    })
    .join(', ');

  const vcErrorMessage = vpResult.credentialResults
    .filter(result => !result.verified)
    .map(result => {
      return result.results
        .filter(result => !result.verified)
        .map(result => result.error.message);
    })
    .reduce((accumulatedMessages, currentMessages) =>
      accumulatedMessages.concat(currentMessages), [])
    .join(', ');

  const statusErrorMessage = vpResult.credentialResults.filter(
    result => result.statusResult).map(result => {
    if(result.statusResult.errors?.length) {
      return result.statusResult.errors?.join(', ');
    } else if(!result.statusResult.verified) {
      return 'The status credential could not be verified.';
    }

    const statusResults = result.statusResult.results ?? [];
    for(const statusResult of statusResults) {
      if(!statusResult.verified) {
        return `The status credential ${
          statusResult.credentialStatus?.id} could not be verified.`;
      } else if(statusResult.credentialStatus?.statusPurpose !== 'revocation') {
        return 'The status credential is not a revocation status. Only ' +
            'revocation statusPurpose is supported at this time. Other ' +
            'purposes must be treated as invalid.';
      } else if(statusResult.status === true) {
        return 'The credential has been revoked.';
      }
    }
  }).filter(m => !!m).join(', ');

  const errors = [
    ...(vpErrorMessage ? [vpErrorMessage] : []),
    ...(vcErrorMessage ? [vcErrorMessage] : []),
    ...(statusErrorMessage ? [statusErrorMessage] : [])
  ];
  return errors;
};

export const verifyUtils = {
  checkStatus,
  verifyPresentationDataIntegrity: async options => verify(options),
  verifyCredentialDataIntegrity: async options => verifyCredential(options),
  verifyPresentationJWT: async (jwt, options) => verifyJWTVP(jwt, options),
  verifyCredentialJWT: async (jwt, options) => verifyJWTVC(jwt, options),
  verifyx509JWT: async (certs, options) => verifyChain(certs, options),
  getVerifyPresentationDataIntegrityErrors,
  checkVcForVpr
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

// Presentation event log name
const PRESENTATION_EVENT_LOG_NAME = 'presentation_event';

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
  const startEvent = getPresentationEvent(
    PresentationEvent.PresentationStart, clientId, exchangeId);
  logger.info(PRESENTATION_EVENT_LOG_NAME, startEvent);
};

/**
 * Gets a consistent presentation success event object.
 * @param {string | undefined} clientId the relying party identifier
 * @returns {object}
 */
const presentationSuccess = (clientId, exchangeId) => {
  const successEvent = getPresentationEvent(
    PresentationEvent.PresentationSuccess, clientId, exchangeId);
  logger.info(PRESENTATION_EVENT_LOG_NAME, successEvent);
};

/**
 * Gets a consistent presentation error event object.
 * @param {string | undefined} clientId the relying party identifier
 * @returns {object}
 */
const presentationError = (clientId, exchangeId, error) => {
  const errorEvent = getPresentationEvent(
    PresentationEvent.PresentationError, clientId, exchangeId, error);
  logger.info(PRESENTATION_EVENT_LOG_NAME, errorEvent);
};

export const logUtils = {
  presentationStart,
  presentationSuccess,
  presentationError
};
