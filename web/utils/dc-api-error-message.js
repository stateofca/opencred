/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Resolve the user-visible error message for the DC API interaction
 * banner. Technical error message is shown if a user-facing default
 * is not set.
 *
 * @param {object} options - Options.
 * @param {object|string|null} options.error - The DC API error,
 *   either a string, an object with a `message` property, or
 *   `null` / `undefined` when no error is present.
 * @param {Function} options.t - The vue-i18n `t` function (or a
 *   compatible stub in tests).
 * @returns {string} The message to display.
 */
export function resolveDcApiErrorMessage({error, t} = {}) {
  const generic = t('defaultDcApiErrorMessage');
  if(generic !== '') {
    return generic;
  }
  if(!error) {
    return '';
  }
  if(typeof error === 'string') {
    return error;
  }
  return error.message || t('error_defaultMessage');
}
