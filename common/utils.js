/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles Copyright 2023
 * - 2024 Digital Bazaar, Inc.
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
import {
  checkStatus as checkStatusBitstring
} from '@digitalbazaar/vc-bitstring-status-list';
import {ConfidentialClientApplication} from '@azure/msal-node';
import {decodeJwt} from 'jose';
import {didResolver} from './documentLoader.js';
import {generateId} from 'bnid';
import {httpClient} from '@digitalbazaar/http-client';
import {JSONPath} from 'jsonpath-plus';
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
  } catch {
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
  } catch {
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
  } catch {
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
        const jwt = credentialId.split(',')[1];
        const {vc} = decodeJwt(jwt);
        // Preserve the JWT string in proof.jwt for verification
        return {
          ...vc,
          proof: {
            ...vc.proof,
            jwt
          }
        };
      }
      // VerifiableCredential already decoded
      return t;
    }
    // JWT in Compact Serialization
    const vc = decodeJwt(t).vc;
    // Preserve the JWT string in proof.jwt for verification
    return {
      ...vc,
      proof: {
        ...vc.proof,
        jwt: t
      }
    };
  });
};

/**
 * Normalizes a vp_token JWT string to handle both plain JWT strings and
 * JSON-stringified JWT strings (per OID4VP Draft 18 ambiguity).
 *
 * @param {string} vpToken - The vp_token value (may be plain JWT or
 *   JSON-stringified JWT).
 * @returns {string} - The normalized JWT string (unwrapped if needed).
 */
export const normalizeVpTokenJwt = vpToken => {
  if(typeof vpToken !== 'string') {
    return vpToken;
  }
  // Handle OID4VP Draft 18 edge case: vp_token may be JSON-stringified.
  // Attempt to parse; if it's JSON-stringified, unwrap it. If parsing fails
  // or results in a non-string, return the original value.
  try {
    const parsed = JSON.parse(vpToken);
    // If parsing succeeds and result is still a string, it was JSON-stringified
    if(typeof parsed === 'string') {
      return parsed;
    }
    // If parsing results in an object, return original (shouldn't happen
    // for JWT)
    return vpToken;
  } catch {
    // If JSON parsing fails, it's not JSON-stringified, return as-is
    return vpToken;
  }
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

// Verify Utilities

const SUPPORTED_STATUS_ENTRY_TYPES = [
  'BitstringStatusListEntry'
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
 * Checks if a Verifiable Credential matches a query specification.
 *
 * @param {object} options - Options object containing VC and query specs.
 * @param {object} options.vc - The Verifiable Credential object to check.
 * @param {object} [options.vpr] - The Verifiable Presentation Request (legacy
 * format) object.
 * @param {object} [options.dcql_query] - The DCQL query object describing
 * credential requirements.
 * @param {object} [options.presentation_definition] - The OID4VP presentation
 * definition object (legacy format).
 * @param {object} [options.presentation_submission] - The Presentation
 * Submission object (Draft 18 format indicator).
 * @param {Array} [options.query] - The workflow.query array (fallback option).
 * @returns {boolean} True if the VC matches the query specification.
 * @throws {Error} If more than one query type is specified or none are
 * specified.
 */
function checkVcQueryMatch({
  vc, vpr, dcql_query, presentation_definition, presentation_submission,
  query}) {
  // If submission against draft18, check that first,
  // otherwise check dcql_query, or fall back to vpr
  if(presentation_definition && (presentation_submission || !dcql_query)) {
    return checkVcForPresentationDefinition(vc, presentation_definition);
  }
  // Fallback to dcql_query if presentation_definition not available
  if(dcql_query) {
    return checkVcForDcql(vc, dcql_query);
  }
  // Handle presentation exchange VPR (Doesn't depend on submission format)
  if(vpr) {
    return checkVcForVpr(vc, vpr);
  }
  // Fallback to workflow.query if vpr not available
  if(query) {
    return checkVcForQuery(vc, query);
  }

  return false;
}

/**
 * Checks if a Verifiable Credential matches a Verifiable Presentation Request.
 *
 * @param {object} vc - The Verifiable Credential to check.
 * @param {object} vpr - The Verifiable Presentation Request containing the
 * query.
 * @returns {boolean} True if the VC matches the VPR.
 */
function checkVcForVpr(vc, vpr) {
  // Extract the example from the VPR (only QueryByExample supported)
  if(!vpr.query?.type || vpr.query?.type !== 'QueryByExample') {
    return false;
  }
  const example = vpr.query.credentialQuery.example;

  // Only Context and Type fields are supported for QueryByExample at this time.
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

/**
 * Checks if a Verifiable Credential matches a workflow.query array.
 *
 * @param {object} vc - The Verifiable Credential to check.
 * @param {Array} query - Array of query objects from workflow.query.
 * @returns {boolean} True if the VC matches any query item in the array.
 */
function checkVcForQuery(vc, query) {
  if(!Array.isArray(query) || query.length === 0) {
    return false;
  }

  // Check all query items, return true if any match
  for(const queryItem of query) {
    if(!queryItem || typeof queryItem !== 'object') {
      continue;
    }

    let matches = true;

    // Check context if specified
    if(queryItem.context && Array.isArray(queryItem.context) &&
      queryItem.context.length > 0) {
      const expectedContext = queryItem.context;
      const vcContext = arrayOf(vc['@context']);
      if(!expectedContext.every(ctx => vcContext.includes(ctx))) {
        matches = false;
        continue;
      }
    }

    // Check type if specified
    if(queryItem.type && Array.isArray(queryItem.type) &&
      queryItem.type.length > 0) {
      const expectedType = queryItem.type;
      const vcType = arrayOf(vc.type);
      if(!expectedType.every(type => vcType.includes(type))) {
        matches = false;
        continue;
      }
    }

    // If we get here, this query item matches
    if(matches) {
      return true;
    }
  }

  // No query items matched
  return false;
}

/**
 * Checks if a Verifiable Credential matches a single credential query.
 *
 * @param {object} vc - The Verifiable Credential to check.
 * @param {object} credentialQuery - A single credential query from DCQL.
 * @returns {object} - Object with `matches` (boolean) and `errors` (array).
 */
function checkVcAgainstCredentialQuery(vc, credentialQuery) {
  const errors = [];

  // Note: Format checking is not done here because VCs don't have a format
  // property. Format validation happens at the submission level (in
  // verifyDraft18Submission/verifyOID4VPSubmission) where format information
  // is available from:
  // - Draft 18: presentation_submission.descriptor_map[].format or
  //   path_nested.format
  // - OID4VP 1.0: dcql_query.credentials[].format

  // Check meta constraints if specified
  if(credentialQuery.meta) {
    // For now, we'll do basic context and type matching A full implementation
    // would need to handle all meta properties
    if(credentialQuery.meta['@context']) {
      const expectedContext = arrayOf(credentialQuery.meta['@context']);
      const vcContext = arrayOf(vc['@context']);
      if(!expectedContext.every(ctx => vcContext.includes(ctx))) {
        const expectedStr = expectedContext.join(', ');
        const gotStr = vcContext.join(', ');
        errors.push(
          `Context mismatch: expected all of [${expectedStr}], ` +
          `got [${gotStr}]`
        );
      }
    }
    if(credentialQuery.meta.type) {
      const expectedType = arrayOf(credentialQuery.meta.type);
      const vcType = arrayOf(vc.type);
      if(!expectedType.every(type => vcType.includes(type))) {
        errors.push(
          `Type mismatch: expected all of [${expectedType.join(', ')}], ` +
          `got [${vcType.join(', ')}]`
        );
      }
    }
  }

  return {
    matches: errors.length === 0,
    errors
  };
}

/**
 * Checks if a Verifiable Credential matches a DCQL query.
 *
 * @param {object} vc - The Verifiable Credential to check.
 * @param {object} dcql_query - The DCQL query.
 * @returns {boolean} True if the VC matches any of the credential queries.
 */
function checkVcForDcql(vc, dcql_query) {
  if(!dcql_query.credentials || !Array.isArray(dcql_query.credentials)) {
    return false;
  }

  if(dcql_query.credentials.length === 0) {
    return false;
  }

  // Check all credential queries, return true if any match
  const allErrors = [];
  for(let i = 0; i < dcql_query.credentials.length; i++) {
    const credentialQuery = dcql_query.credentials[i];
    if(!credentialQuery) {
      allErrors.push({
        queryIndex: i,
        errors: ['Credential query is missing or invalid']
      });
      continue;
    }

    const result = checkVcAgainstCredentialQuery(vc, credentialQuery);
    if(result.matches) {
      // Found a match, return true immediately
      return true;
    }

    // Record errors for this query
    allErrors.push({
      queryIndex: i,
      errors: result.errors
    });
  }

  // All queries failed, return false
  // Note: allErrors contains organized error information for debugging
  return false;
}

/**
 * Checks if a Verifiable Credential matches an OID4VP presentation definition.
 *
 * @param {object} vc - The Verifiable Credential to check.
 * @param {object} presentation_definition - The OID4VP presentation definition.
 * @returns {boolean} True if the VC matches the presentation definition.
 */
function checkVcForPresentationDefinition(vc, presentation_definition) {
  if(!presentation_definition.input_descriptors ||
    !Array.isArray(presentation_definition.input_descriptors)) {
    return false;
  }

  // Check against the first input descriptor
  const inputDescriptor = presentation_definition.input_descriptors[0];
  if(!inputDescriptor || !inputDescriptor.constraints ||
    !inputDescriptor.constraints.fields) {
    return false;
  }

  const fields = inputDescriptor.constraints.fields;
  for(const field of fields) {
    if(!field.path || !field.filter) {
      continue;
    }

    // Handle path as either string or array of strings
    const paths = Array.isArray(field.path) ? field.path : [field.path];
    let fieldName = null;

    // Try to parse each path to extract the field name
    // Use the first path that can be successfully parsed
    for(const path of paths) {
      if(typeof path !== 'string') {
        continue;
      }

      try {
        const pathArray = JSONPath.toPathArray(path);
        if(!pathArray || pathArray.length === 0) {
          continue;
        }

        // Extract the field name from the last path segment (when it's a
        // property name)
        const lastSegment = pathArray[pathArray.length - 1];
        if(typeof lastSegment === 'string' && lastSegment !== '$') {
          fieldName = lastSegment;
          break;
        }
      } catch {
        // Skip invalid paths
        continue;
      }
    }

    if(!fieldName) {
      continue;
    }

    const vcFieldValue = arrayOf(vc[fieldName]);

    // Handle filter.allOf (requires ALL conditions to be satisfied)
    if(field.filter.allOf && Array.isArray(field.filter.allOf)) {
      // Each item in allOf must be satisfied
      for(const allOfFilter of field.filter.allOf) {
        // Check if this allOf filter has a contains constraint
        if(allOfFilter.contains) {
          const contains = allOfFilter.contains;
          const expectedValue = contains.type === 'string' ?
            contains.const : null;

          if(expectedValue === null) {
            // If we can't extract a value, skip this allOf condition
            continue;
          }

          // The VC field value must contain this expected value
          if(!vcFieldValue.includes(expectedValue)) {
            return false;
          }
        }
        // Add support for other filter types in allOf if needed
      }
      // If we processed allOf, continue to next field
      continue;
    }

    // Handle filter.contains as either array or single object (legacy/fallback)
    const contains = field.filter.contains;
    const expectedValues = Array.isArray(contains) ? contains :
      (contains ? [contains] : []);
    const expectedValueStrings = expectedValues
      .filter(item => item && item.type === 'string')
      .map(item => item.const);

    if(expectedValueStrings.length === 0) {
      continue;
    }

    if(!expectedValueStrings.every(value => vcFieldValue.includes(value))) {
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
        .map(result => result.error?.message);
    })
    .reduce((accumulatedMessages, currentMessages) =>
      accumulatedMessages.concat(currentMessages), [])
    .filter(Boolean)
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
  checkVcForVpr,
  checkVcQueryMatch
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

const getMsalClient = workflow => {
  const {
    apiLoginBaseUrl,
    apiClientId,
    apiClientSecret,
    apiTenantId
  } = workflow.workflow; // TODO: Is this still correct?
  // Make sure this is covered by tests
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
    scopes: [MSAL_ACCESS_TOKEN_REQUEST_SCOPE]
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
  PresentationError: 'presentation_error',
  CallbackSuccess: 'callback_success'
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
 *
 * @param {string | undefined} clientId - The workflow identifier.
 * @param {string} exchangeId - The exchange identifier.
 * @param {string} [profile] - Optional OID4VP profile identifier.
 * @returns {object} Presentation start event object.
 */
const presentationStart = (clientId, exchangeId, profile) => {
  const startEvent = {
    ...getPresentationEvent(
      PresentationEvent.PresentationStart, clientId, exchangeId),
    ...(profile && {profile})
  };
  logger.info(PRESENTATION_EVENT_LOG_NAME, startEvent);
};

/**
 * Gets a consistent presentation success event object.
 *
 * @param {string | undefined} clientId - The workflow identifier.
 * @param {string} exchangeId - The exchange identifier.
 * @returns {object} Presentation success event object.
 */
const presentationSuccess = (clientId, exchangeId) => {
  const successEvent = getPresentationEvent(
    PresentationEvent.PresentationSuccess, clientId, exchangeId);
  logger.info(PRESENTATION_EVENT_LOG_NAME, successEvent);
};

/**
 * Gets a consistent presentation error event object.
 *
 * @param {string | undefined} clientId - The workflow identifier.
 * @param {string} exchangeId - The exchange identifier.
 * @param {Error} error - The error that occurred.
 * @returns {object} Presentation error event object.
 */
const presentationError = (clientId, exchangeId, error) => {
  const errorEvent = getPresentationEvent(
    PresentationEvent.PresentationError, clientId, exchangeId, error);
  logger.info(PRESENTATION_EVENT_LOG_NAME, errorEvent);
};

/**
 * Gets a consistent callback success event object.
 * Emitted only when a callback is configured and HTTP delivery succeeded.
 *
 * @param {string | undefined} clientId - The workflow identifier.
 * @param {string} exchangeId - The exchange identifier.
 * @returns {object} Callback success event object.
 */
const callbackSuccess = (clientId, exchangeId) => {
  const successEvent = getPresentationEvent(
    PresentationEvent.CallbackSuccess, clientId, exchangeId);
  logger.info(PRESENTATION_EVENT_LOG_NAME, successEvent);
};

export const logUtils = {
  presentationStart,
  presentationSuccess,
  presentationError,
  callbackSuccess
};
