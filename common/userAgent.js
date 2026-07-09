/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Detects Samsung Internet from a User-Agent string. Samsung Internet
 * always includes a `SamsungBrowser/<version>` product token; Chrome on
 * Samsung hardware does not.
 *
 * @param {string} userAgent - The User-Agent string to test.
 * @returns {boolean} True if the User-Agent is Samsung Internet.
 */
export function isSamsungBrowser(userAgent) {
  if(typeof userAgent !== 'string') {
    return false;
  }
  return /SamsungBrowser/i.test(userAgent);
}
