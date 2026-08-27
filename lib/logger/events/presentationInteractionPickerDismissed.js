/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build an interaction-picker-dismissed event payload (no logging). Emitted
 * when the user opens the interaction picker and dismisses it (backdrop or
 * ESC) without selecting a method — the abandonment signal. By definition
 * no method switch occurred; `method` is the method the user remained on.
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {string} [options.method] - The interaction method the user
 *   remained on (e.g. `dcapi`, `qr-and-link`). A UI-choice enum, not
 *   personal data.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationInteractionPickerDismissed({
  clientId, exchangeId, method
}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_interaction_picker_dismissed',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined,
      ...(method && {method})
    }
  };
}
