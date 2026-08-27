/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a presentation request served event payload (no logging). Emitted
 * when an authorization request has been generated, signed, and sent to
 * the wallet.
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {string} [options.profile] - OID4VP profile identifier.
 * @param {string} [options.responseMode] - OID4VP response mode.
 * @param {string} [options.wire] - Wire format of the served request
 *   (`dcApiRequest` or `jar-jwt`).
 * @param {string} [options.requestGroupId] - Correlates every request served by
 *   one authorization request call.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationRequestServed({
  clientId, exchangeId, profile, responseMode, wire, requestGroupId
}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_request_served',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined,
      ...(profile && {profile}),
      ...(responseMode && {responseMode}),
      ...(wire && {wire}),
      ...(requestGroupId && {requestGroupId})
    }
  };
}
