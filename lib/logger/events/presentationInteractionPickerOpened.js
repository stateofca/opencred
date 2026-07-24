/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build an interaction-picker-opened event payload (no logging). Emitted
 * when the user clicks "Other ways to connect" and the interaction picker
 * opens. Marks the top of the picker funnel (denominator for the
 * selected/dismissed outcomes).
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {string} [options.method] - The interaction method active when the
 *   picker opened (e.g. `dcapi`, `qr-and-link`). A UI-choice enum, not
 *   personal data.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationInteractionPickerOpened({
  clientId, exchangeId, method
}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_interaction_picker_opened',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined,
      ...(method && {method})
    }
  };
}
