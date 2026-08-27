/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build an exchange-expiry event payload (no logging). Emitted when the
 * client-side timer observes that the exchange TTL has elapsed and shows
 * the user the expiry notice. Distinguishes an exchange the user watched
 * time out from one they simply abandoned: without it, both appear in the
 * logs as a `presentation_start` with no terminal event.
 *
 * Named `exchange_expired` rather than taking the `presentation_` prefix of
 * the surrounding events: what expired is the exchange itself, and no
 * presentation was involved. The existing `presentation_*` names are a known
 * misnomer awaiting a holistic review; this event does not add to it.
 *
 * Client-reported and therefore best-effort — an exchange that expires
 * after the user closes the tab produces no event.
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function exchangeExpired({clientId, exchangeId}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'exchange_expired',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined
    }
  };
}
