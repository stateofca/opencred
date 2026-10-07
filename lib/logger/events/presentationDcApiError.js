/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a DC API error event payload (no logging). Emitted when
 * `navigator.credentials.get` rejects with anything other than
 * `NotAllowedError` (e.g. `AbortError` or another `DOMException`),
 * indicating a wallet/browser-side failure rather than user cancellation.
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
 * @param {string} [options.errorName] - The rejected promise's
 *   `DOMException`/`Error` `name` (e.g. `AbortError`). Never the raw
 *   error message, to avoid leaking wallet-implementation detail.
 * @param {string} [options.dcApiErrorReason] - Coarse, log-safe reason bucket
 *   derived server-side from the raw error message by
 *   `classifyDcApiErrorReason` (e.g. `no-provider`, `transport`,
 *   `request-fetch`, `other`). The raw message reaches the log only inside
 *   `outcome.diagnostics`, when `options.dcApiDiagnostics` is on.
 * @param {object} [options.outcome] - Sanitized DC API outcome fields from
 *   `sanitizeDcApiOutcome` (timing, context, UA detail, and, only when
 *   `options.dcApiDiagnostics` is on, raw `diagnostics`).
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationDcApiError({
  clientId, exchangeId, profile, errorName, dcApiErrorReason, profiles,
  requestGroupId, outcome
}) {
  return {
    logName: 'presentation_event',
    event: {
      // Spread first so the fixed fields below always win.
      ...outcome,
      type: 'presentation_dc_api_error',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined,
      ...(profile && {profile}),
      ...(Array.isArray(profiles) && profiles.length > 0 && {profiles}),
      ...(requestGroupId && {requestGroupId}),
      ...(errorName && {errorName}),
      ...(dcApiErrorReason && {dcApiErrorReason})
    }
  };
}
