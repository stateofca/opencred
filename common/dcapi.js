/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Check if DC API is available based on signing key certificate configuration
 * @param {Object} opencredConfig - The opencred configuration object
 * @param {Array} opencredConfig.signingKeys - Array of signing key configurations
 * @returns {boolean} True if DC API can be initialized
 */
export function isDcApiAvailable(opencredConfig) {
  const {signingKeys} = opencredConfig || {};
  if(!signingKeys || !Array.isArray(signingKeys)) {
    return false;
  }
  const signingKey = signingKeys.find(k =>
    k.purpose?.includes('authorization_request')
  );
  if(!signingKey) {
    return false;
  }
  // Check if certificatePem is configured
  return !!(signingKey.certificatePem &&
    typeof signingKey.certificatePem === 'string' &&
    signingKey.certificatePem.trim().length > 0);
}

