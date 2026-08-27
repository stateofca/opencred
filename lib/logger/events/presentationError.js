/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a presentation error event payload (no logging).
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {*} options.error - Error message or detail.
 * @param {string} [options.profile] - OID4VP profile identifier. Omitted when
 *   the failure cannot be attributed to one profile.
 * @param {Array<string>} [options.profiles] - The profiles offered together,
 *   when the failure is not attributable to a single one.
 * @param {string} [options.requestGroupId] - Correlates this failure with the
 *   authorization request call it belongs to.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationError({
  clientId, exchangeId, error, profile, profiles, requestGroupId
}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_error',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error,
      ...(profile && {profile}),
      ...(Array.isArray(profiles) && profiles.length > 0 && {profiles}),
      ...(requestGroupId && {requestGroupId})
    }
  };
}
