/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Formats an application version for footer display.
 *
 * @param {string} [version] - The raw version string from `package.json`.
 *
 * @returns {string} The display string (e.g. `v10.5.0`), or an empty string
 *   when no usable version is supplied.
 */
export function formatVersion(version) {
  if(typeof version !== 'string') {
    return '';
  }
  const trimmed = version.trim();
  return trimmed === '' ? '' : `v${trimmed}`;
}
