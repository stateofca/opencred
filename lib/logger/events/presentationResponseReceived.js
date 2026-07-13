/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a presentation response received event payload (no logging).
 * Emitted when the wallet has POSTed an authorization response, before
 * verification runs.
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationResponseReceived({clientId, exchangeId}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_response_received',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined
    }
  };
}
