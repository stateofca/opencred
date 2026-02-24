/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * VP token normalization utilities (Data Integrity format).
 */

import base64url from 'base64url';

/**
 * Normalize VP token (Data Integrity format) to array of credential objects.
 * @param {string|object|Array} vpToken - VP token in various formats
 * @returns {Array|null} - Array of credential objects, or null if invalid
 */
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
          return null;
        }
      }
      return item;
    });
  }

  return null;
};
