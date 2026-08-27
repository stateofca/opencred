/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a presentation initiated event payload (no logging). Emitted when
 * an exchange is created and the verifier UI is about to show the QR/link.
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationInitiated({clientId, exchangeId}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_initiated',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined
    }
  };
}
