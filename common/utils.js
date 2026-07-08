/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
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
import {checkStatus} from '../lib/credential-status/index.js';
import {ConfidentialClientApplication} from '@azure/msal-node';
import {decodeJwt} from 'jose';
import {didResolver} from './documentLoader.js';
import {expandTypes} from '../lib/workflows/common/type-expansion.js';
import {generateId} from 'bnid';
import {httpClient} from '@digitalbazaar/http-client';
import {JSONPath} from 'jsonpath-plus';
import {logger} from '../lib/logger.js';
import {VC_BASE_IRI} from '../lib/workflows/common/oid4vp.js';
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
 * @param {object} options - Options.
 * @param {object} options.vc - The Verifiable Credential to check.
 * @param {object} [options.vpr] - The Verifiable Presentation Request.
 * @param {object} [options.dcql_query] - The DCQL query object.
 * @param {object} [options.presentation_definition] - The presentation
 *   definition (legacy).
 * @param {object} [options.presentation_submission] - The presentation
 *   submission (Draft 18).
 * @param {Array} [options.query] - The workflow.query array (fallback).
 * @returns {Promise<boolean>} True if the VC matches the query.
 */
async function checkVcQueryMatch({
  vc, vpr, dcql_query, presentation_definition, presentation_submission,
  query}) {
  if(presentation_definition && (presentation_submission || !dcql_query)) {
    return checkVcForPresentationDefinition(vc, presentation_definition);
  }
  if(dcql_query) {
    return checkVcForDcql(vc, dcql_query);
  }
  if(vpr) {
    return checkVcForVpr(vc, vpr);
  }
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
 * Map of generation-side `type_values` IRIs to the compact term that
 * every well-formed VC carries in `vc.type` for the same concept.
 * Used by the matcher fast path to answer `meta.type_values` checks
 * without invoking JSON-LD expansion. Today this carries exactly one
 * entry; new entries are added here as we expand what the generation
 * path emits in `meta.type_values`.
 */
const _KNOWN_TYPE_ALIASES = new Map([
  [VC_BASE_IRI, 'VerifiableCredential']
]);

/**
 * Returns true when every IRI required by `typeValues` has a known
 * compact alias in `_KNOWN_TYPE_ALIASES`. When true, the matcher can
 * answer the `meta.type_values` check from `vc.type` membership alone
 * (no JSON-LD expansion).
 *
 * Empty `typeValues` (and any non-array / empty sub-array) returns
 * false, deferring to the expansion path for invalid or unusual shapes.
 *
 * @param {Array<Array<string>>} typeValues - The `type_values` shape
 *   from a DCQL credential query's `meta`.
 * @returns {boolean} - True when the fast path applies.
 */
function _typeValuesAreAllKnownAliases(typeValues) {
  if(!Array.isArray(typeValues) || typeValues.length === 0) {
    return false;
  }
  return typeValues.every(sub =>
    Array.isArray(sub) &&
    sub.length > 0 &&
    sub.every(iri => _KNOWN_TYPE_ALIASES.has(iri))
  );
}

/**
 * Returns true when the VC's `type` array satisfies at least one
 * sub-array of `typeValues` under "compact OR expanded" membership.
 *
 * For each sub-array, every required IRI must be present in `vcTypes`
 * either as the IRI itself or as its compact alias from
 * `_KNOWN_TYPE_ALIASES`. Mirrors the any-sub-array semantics used in
 * full DCQL query matching.
 *
 * @param {Array<string>} vcTypes - The VC's `type` array.
 * @param {Array<Array<string>>} typeValues - The `type_values` shape
 *   from a DCQL credential query's `meta`.
 * @returns {boolean} - True when the VC satisfies the requirement.
 */
function _vcSatisfiesAliasedTypeValues(vcTypes, typeValues) {
  return typeValues.some(sub =>
    sub.every(iri =>
      vcTypes.includes(iri) ||
      vcTypes.includes(_KNOWN_TYPE_ALIASES.get(iri))
    )
  );
}

/**
 * Checks if a Verifiable Credential matches a single DCQL credential query.
 *
 * For DCQL queries with `meta.type_values` (OID4VP 1.0): when every required
 * IRI is one of the known aliases (`_KNOWN_TYPE_ALIASES`), fast-matches against
 * known values. When any required IRI is not in the alias map, falls back to
 * expanding the VC's `type` array via `expandTypes` and requires at least one
 * `type_values` sub-array to be a subset of the expanded VC types. Also
 * verifies DCQL `claims[]` entries.
 *
 * @param {object} vc - The Verifiable Credential to check.
 * @param {object} credentialQuery - A single credential query from DCQL.
 * @returns {Promise<object>} - Object with `matches` (boolean) and
 *   `errors` (array).
 */
async function checkVcAgainstCredentialQuery(vc, credentialQuery) {
  const errors = [];

  if(credentialQuery.meta?.type_values) {
    const typeValues = credentialQuery.meta.type_values;
    const vcTypes = arrayOf(vc.type);
    const vcContexts = arrayOf(vc['@context']);

    if(vcContexts.length === 0) {
      errors.push('VC has no @context for type expansion');
      return {matches: false, errors};
    }

    if(_typeValuesAreAllKnownAliases(typeValues)) {
      // Fast path: every required IRI has a known compact alias; check
      // membership on vc.type directly without JSON-LD expansion. This
      // also tolerates VCs whose `type` array contains extra/unknown
      // terms that the VC's @context does not define.
      if(!_vcSatisfiesAliasedTypeValues(vcTypes, typeValues)) {
        const vcTypesStr = vcTypes.join(', ');
        const expectedStr = typeValues
          .map(tv => `[${tv.join(', ')}]`).join(' | ');
        errors.push(
          `Type mismatch: VC types [${vcTypesStr}] do not satisfy any ` +
          `of the required type_values: ${expectedStr}`
        );
      }
    } else {
      // Expansion path: some required IRI is not in the alias map.
      // Typically reached for implementer-supplied dcql_query overrides
      // with arbitrary IRIs.
      let expandedVcTypes;
      try {
        expandedVcTypes = await expandTypes({
          types: vcTypes,
          contexts: vcContexts
        });
      } catch(e) {
        errors.push(`Failed to expand VC types: ${e.message}`);
        return {matches: false, errors};
      }

      // Each sub-array is a set of required type IRIs; the VC must
      // contain all.
      const typeMatch = typeValues.some(requiredTypes => {
        if(!Array.isArray(requiredTypes) || requiredTypes.length === 0) {
          return true;
        }
        return requiredTypes.every(
          reqType => expandedVcTypes.includes(reqType)
        );
      });

      if(!typeMatch) {
        const expandedStr = expandedVcTypes.join(', ');
        const expectedStr = typeValues
          .map(tv => `[${tv.join(', ')}]`).join(' | ');
        errors.push(
          `Type mismatch: VC types [${expandedStr}] do not satisfy any ` +
          `of the required type_values: ${expectedStr}`
        );
      }
    }
  }

  if(Array.isArray(credentialQuery.claims)) {
    for(const claim of credentialQuery.claims) {
      if(!claim || !Array.isArray(claim.path) || claim.path.length === 0) {
        continue;
      }
      const field = _resolveClaimVcField(claim.path);
      if(!field) {
        // Unrecognized claim path: do not fail the match. Other claim
        // shapes (for example, mso_mdoc namespaced paths) are not routed
        // through this function.
        continue;
      }
      const required = Array.isArray(claim.values) ? claim.values : [];
      if(required.length === 0) {
        continue;
      }
      const actual = arrayOf(vc[field]);
      const missing = required.filter(v => !actual.includes(v));
      if(missing.length > 0) {
        errors.push(
          `Claim mismatch on '${field}': VC is missing required ` +
          `value(s) [${missing.join(', ')}]`
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
 * Maps a DCQL claim path candidate list to the VC field it targets.
 *
 * Recognized paths (in candidate order, first match wins):
 *   `$['@context']`, `$.vc['@context']` map to `@context`.
 *   `$.type`, `$.vc.type`, `$.verifiableCredential.type` map to `type`.
 *
 * @param {Array<string>} pathCandidates - JSONPath strings from a DCQL
 *   claim's `path` array.
 * @returns {string|null} - The VC field name (`'@context'` or `'type'`),
 *   or `null` if no candidate matches a known field.
 */
function _resolveClaimVcField(pathCandidates) {
  const ctxPaths = new Set([
    '$[\'@context\']',
    '$.vc[\'@context\']'
  ]);
  const typePaths = new Set([
    '$.type',
    '$.vc.type',
    '$.verifiableCredential.type'
  ]);
  for(const p of pathCandidates) {
    if(ctxPaths.has(p)) {
      return '@context';
    }
    if(typePaths.has(p)) {
      return 'type';
    }
  }
  return null;
}

/**
 * Checks if a Verifiable Credential matches a DCQL query.
 *
 * @param {object} vc - The Verifiable Credential to check.
 * @param {object} dcql_query - The DCQL query.
 * @returns {Promise<boolean>} True if the VC matches any credential query.
 */
async function checkVcForDcql(vc, dcql_query) {
  if(!dcql_query.credentials || !Array.isArray(dcql_query.credentials)) {
    return false;
  }

  if(dcql_query.credentials.length === 0) {
    return false;
  }

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

    const result = await checkVcAgainstCredentialQuery(vc, credentialQuery);
    if(result.matches) {
      return true;
    }

    allErrors.push({
      queryIndex: i,
      errors: result.errors
    });
  }

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

export {logUtils} from '../lib/logger/events/index.js';
