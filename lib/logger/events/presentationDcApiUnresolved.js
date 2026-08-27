/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a DC API unresolved-response event payload (no logging). Emitted when a
 * wallet response could not be attributed to any pending authorization request:
 * either no pending request used the protocol the wallet answered with, or
 * several did.
 *
 * A distinct event type rather than a plain `presentation_error` because this
 * failure knows different things: it has the response protocol and the profiles
 * that were pending, but by definition **not** which profile answered. Folding
 * it into the generic error event would make it unqueryable and invite reading
 * an absent `profile` as "unknown profile" rather than "not attributable".
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {string} [options.protocol] - DC API protocol the response claimed.
 * @param {Array<string>} [options.candidateProfiles] - Profiles that were
 *   pending when the response arrived.
 * @param {string} [options.requestGroupId] - Correlates with the authorization
 *   request call that issued the pending requests.
 * @param {*} [options.error] - Error message or detail.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationDcApiUnresolved({
  clientId, exchangeId, protocol, candidateProfiles, requestGroupId, error
}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_dc_api_unresolved',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error,
      ...(protocol && {protocol}),
      ...(Array.isArray(candidateProfiles) && candidateProfiles.length > 0 &&
        {candidateProfiles}),
      ...(requestGroupId && {requestGroupId})
    }
  };
}
