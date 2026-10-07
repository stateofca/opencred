/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a DC API flow error event payload (no logging). Emitted when a DC API
 * presentation fails outside `navigator.credentials.get`: fetching the request
 * envelopes (`phase: 'fetch'`) or posting the wallet's response
 * (`phase: 'submit'`). A client-side network failure on either call never
 * reaches the server through any other route. `phase` and `httpStatus` arrive
 * in `outcome`.
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {string} [options.profile] - Profile identifier. Present only when
 *   exactly one profile was offered.
 * @param {Array<string>} [options.profiles] - Every profile that was offered.
 * @param {string} [options.requestGroupId] - Correlates with the authorization
 *   request call that issued the offered requests.
 * @param {string} [options.errorName] - The failed call's error `name`
 *   (e.g. `HTTPError`, `TypeError`).
 * @param {object} [options.outcome] - Sanitized DC API outcome fields from
 *   `sanitizeDcApiOutcome`, including `phase` and `httpStatus`.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationDcApiFlowError({
  clientId, exchangeId, profile, profiles, requestGroupId, errorName, outcome
}) {
  return {
    logName: 'presentation_event',
    event: {
      // Spread first so the fixed fields below always win.
      ...outcome,
      type: 'presentation_dc_api_flow_error',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined,
      ...(profile && {profile}),
      ...(Array.isArray(profiles) && profiles.length > 0 && {profiles}),
      ...(requestGroupId && {requestGroupId}),
      ...(errorName && {errorName})
    }
  };
}
