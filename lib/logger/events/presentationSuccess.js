/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a presentation success event payload (no logging).
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {string} [options.profile] - OID4VP profile identifier: the profile
 *   that actually answered.
 * @param {string} [options.requestGroupId] - Correlates this outcome with the
 *   authorization request call that offered the profiles.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationSuccess({
  clientId, exchangeId, profile, requestGroupId
}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_success',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined,
      ...(profile && {profile}),
      ...(requestGroupId && {requestGroupId})
    }
  };
}
