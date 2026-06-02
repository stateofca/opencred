/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Compute seconds remaining until an expiry instant.
 *
 * @param {object} options - Options hashmap.
 * @param {Date|string} options.expires - Expiry instant.
 * @param {number} [options.now] - Clock override (ms since epoch).
 * @returns {number|null} Remaining seconds (>= 0) or null.
 */
export function getSecondsUntilExpires({expires, now} = {}) {
  if(expires == null) {
    return null;
  }
  const expiresDate = expires instanceof Date ?
    expires : new Date(expires);
  if(Number.isNaN(expiresDate.getTime())) {
    return null;
  }
  const nowMs = now ?? Date.now();
  return Math.max(
    0,
    Math.ceil((expiresDate.getTime() - nowMs) / 1000)
  );
}
