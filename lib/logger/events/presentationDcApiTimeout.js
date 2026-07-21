/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a DC API timeout event payload (no logging). Emitted when
 * `navigator.credentials.get` neither resolves nor rejects within the
 * client-side timeout window — no wallet/credential provider ever
 * responded. Distinguishes a non-responsive environment from both a real
 * error and a user cancellation.
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {string} [options.profile] - OID4VP profile identifier.
 * @param {number} [options.timeoutMs] - The configured timeout window, in
 *   milliseconds, that elapsed before the client-initiated abort.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationDcApiTimeout({
  clientId, exchangeId, profile, timeoutMs
}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_dc_api_timeout',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined,
      ...(profile && {profile}),
      ...(timeoutMs && {timeoutMs})
    }
  };
}
