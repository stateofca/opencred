/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Classifies which OID4VP interoperability profile is being used
 * @param {object} options
 * @param {object} options.submission - The presentation_submission
 * (if present)
 * @param {object} options.dcql_query - The dcql_query from authorization
 * request
 * @returns {string|null} - 'oid4vp-draft18', 'oid4vp-1.0', or null if
 * unable to determine
 */
export function classifyOID4VPSubmission({submission, dcql_query}) {
  // Draft 18: Uses presentation_submission with descriptor_map
  if(submission) {
    return 'oid4vp-draft18';
  }

  // OID4VP 1.0: Uses vp_token object keyed by dcql query ids (no submission)
  if(dcql_query?.credentials && Array.isArray(dcql_query.credentials) &&
    dcql_query.credentials.length > 0) {
    return 'oid4vp-1.0';
  }

  // Unable to determine format
  return null;
}
