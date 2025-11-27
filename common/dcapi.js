/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Check if DC API is available based on caStore configuration
 * @param {Object} opencredConfig - The opencred configuration object
 * @param {Object} opencredConfig.caStore - Array of certificate strings
 * @returns {boolean} True if DC API can be initialized
 */
export function isDcApiAvailable(opencredConfig) {
  const {caStore} = opencredConfig || {};
  if(!caStore || !Array.isArray(caStore) || caStore.length === 0) {
    return false;
  }
  const firstCert = caStore[0];
  if(!firstCert || typeof firstCert !== 'string' ||
    firstCert.trim().length === 0) {
    return false;
  }
  return true;
}

