/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Get verifiablePresentationRequest from query or use override.
 * Uses verifiablePresentationRequest override if present, otherwise
 * generates VPR from rp.query.
 * @param {object} options
 * @param {object} options.rp - The relying party config
 * @param {object} options.exchange - The exchange object
 * @param {string} options.domain - The domain
 * @param {string} options.url - The URL path
 * @returns {object} - VerifiablePresentationRequest object
 */
export const getVerifiablePresentationRequest = async ({
  rp, exchange, domain, url
}) => {
  const {verifiablePresentationRequest, query} = rp;

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

    // Add @context if present
    if(q.context && Array.isArray(q.context) && q.context.length > 0) {
      example['@context'] = q.context;
    }

    // Add type if present
    if(q.type && Array.isArray(q.type) && q.type.length > 0) {
      example.type = q.type;
    }

    // Add any fields from q.fields
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
        reason: rp.description || 'Please present your credential.',
        example
      }
    };
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

