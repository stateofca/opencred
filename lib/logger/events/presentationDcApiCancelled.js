/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a DC API cancelled event payload (no logging). Emitted when
 * `navigator.credentials.get` rejects with `NotAllowedError`, indicating
 * the user dismissed or denied the OS-native wallet picker.
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {string} [options.profile] - OID4VP profile identifier. Present only
 *   when exactly one profile was offered.
 * @param {Array<string>} [options.profiles] - Every profile that was offered
 *   together. This outcome means the platform sheet closed without any wallet
 *   answering, so no single profile is responsible.
 * @param {string} [options.requestGroupId] - Correlates with the authorization
 *   request call that issued the offered requests.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationDcApiCancelled({
  clientId, exchangeId, profile, profiles, requestGroupId
}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_dc_api_cancelled',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined,
      ...(profile && {profile}),
      ...(Array.isArray(profiles) && profiles.length > 0 && {profiles}),
      ...(requestGroupId && {requestGroupId})
    }
  };
}
