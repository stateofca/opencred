/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a DC API cancelled event payload (no logging). Emitted when
 * `navigator.credentials.get` rejects with a user-dismissal DOMException:
 * `NotAllowedError` (the W3C Digital Credentials spec name, used by Chromium)
 * or `AbortError` (used by Safari/iOS for the same gesture, once our own
 * timeout-driven abort has been ruled out). Both indicate the user dismissed
 * or denied the OS-native wallet picker.
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
 * @param {string} [options.errorName] - The original DOMException name
 *   (`NotAllowedError` or `AbortError`), kept for diagnostics so the browser
 *   that reported the dismissal can still be distinguished after normalization.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationDcApiCancelled({
  clientId, exchangeId, profile, profiles, requestGroupId, errorName
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
      ...(requestGroupId && {requestGroupId}),
      ...(errorName && {errorName})
    }
  };
}
