/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a presentation start event payload (no logging).
 *
 * One event per authorization request call, not per profile: a DC API call may
 * request several profiles at once, and this event represents the single button
 * press that offered them together. An array yields `profiles`, a lone string
 * yields `profile`, so a query aggregating single-profile flows keeps working.
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {string | Array<string>} [options.profile] - OID4VP profile
 *   identifier, or the profiles requested together.
 * @param {string} [options.requestGroupId] - Correlates this call with the
 *   requests it served and the response that answers one of them.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationStart({
  clientId, exchangeId, profile, requestGroupId
}) {
  const profiles = Array.isArray(profile) ? profile : null;
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_start',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined,
      ...(profiles ? {profiles} : (profile && {profile})),
      ...(requestGroupId && {requestGroupId})
    }
  };
}
