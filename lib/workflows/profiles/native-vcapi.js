/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {logger} from '../../logger.js';
import {verifyLdpPresentation} from '../../../common/vcalm.js';
import {verifyUtils} from '../../../common/utils.js';

/**
 * Get verifiablePresentationRequest from query or use override.
 * Uses verifiablePresentationRequest override if present, otherwise
 * generates VPR from workflow.query.
 * @param {object} options
 * @param {object} options.workflow - The workflow config
 * @param {object} options.exchange - The exchange object
 * @param {string} options.domain - The domain
 * @param {string} options.url - The URL path
 * @returns {object} - VerifiablePresentationRequest object
 */
export const getVerifiablePresentationRequest = async ({
  workflow, exchange, domain, url
}) => {
  const {verifiablePresentationRequest, query} = workflow;

  // If verifiablePresentationRequest override exists in config, use it
  if(verifiablePresentationRequest) {
    const vpr = JSON.parse(verifiablePresentationRequest);
    return {
      ...vpr,
      challenge: exchange.challenge
    };
  }

  // Convert each query item to a QueryByExample query
  const queries = query.map(q => {
    const example = {};
    if(q.context && Array.isArray(q.context) && q.context.length > 0) {
      example['@context'] = q.context;
    }
    if(q.type && Array.isArray(q.type) && q.type.length > 0) {
      example.type = q.type;
    }
    if(q.fields && typeof q.fields === 'object') {
      for(const [fieldKey, fieldValues] of Object.entries(q.fields)) {
        if(Array.isArray(fieldValues) && fieldValues.length > 0) {
          example[fieldKey] = fieldValues;
        }
      }
    }

    return {
      type: 'QueryByExample',
      credentialQuery: {
        reason: workflow.description || 'Please present your credential.',
        example
      }
    };
  });

  queries.push({
    type: 'DIDAuthentication',
    acceptedCryptosuites: [
      {cryptosuite: 'ecdsa-rdfc-2019'},
      {cryptosuite: 'eddsa-rdfc-2022'},
    ],
    acceptedMethods: [{method: 'did:key'}, {method: 'did:web'}]
  });

  // Build VPR structure
  // If only one query, use single query object; otherwise use array
  const vpr = {
    query: queries.length === 1 ? queries[0] : queries,
    challenge: exchange.challenge,
    domain: `${domain}${url.replace('request', 'response')}`
  };

  return vpr;
};

/**
 * Handle verifiable presentation from request body
 * @param {object} options
 * @param {object} options.workflow - The workflow config
 * @param {object} options.exchange - The exchange object
 * @param {object} options.vpToken - The verifiable presentation token
 * @returns {object} - {verified, errors, verifiablePresentation, vc}
 */
export async function handleVerifiablePresentation({
  workflow, exchange, vpToken}) {
  // Verify the LDP presentation directly
  const verificationResult = await verifyLdpPresentation({
    presentation: vpToken,
    exchange
  });

  const {verified, errors, verifiablePresentation, vc} = verificationResult;
  const allErrors = [...errors.map(e => e.message)];

  if(verified && vc) {
    // Check VC match - use checkVcQueryMatch unless
    // workflow.verifiablePresentationRequest exists
    if(workflow.verifiablePresentationRequest) {
      // Use VPR override if present
      let vpr;
      try {
        vpr = JSON.parse(workflow.verifiablePresentationRequest);
      } catch(error) {
        logger.error(error.message, {error});
        allErrors.push('Invalid verifiablePresentationRequest configuration');
      }

      if(vpr && !verifyUtils.checkVcForVpr(vc, vpr)) {
        allErrors.push('Presentation does not match requested credential');
      }
    } else {
      // Use query-based matching
      const {
        vpr, dcql_query, presentation_definition, query
      } = exchange.variables?.authorizationRequest || {};
      if(!verifyUtils.checkVcQueryMatch({
        vc,
        vpr,
        dcql_query,
        presentation_definition,
        query
      })) {
        allErrors.push('Presentation does not match requested credential');
      }
    }

    // Check issuer against trusted issuers
    if(workflow.trustedCredentialIssuers?.length > 0) {
      const vcIssuer = typeof vc.issuer === 'string' ?
        vc.issuer : vc.issuer.id;
      if(!workflow.trustedCredentialIssuers.includes(vcIssuer)) {
        allErrors.push('Unaccepted credential issuer');
      }
    }
  }

  return {
    verified: verified && allErrors.length === 0,
    errors: allErrors,
    verifiablePresentation,
    vc
  };
}
