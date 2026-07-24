/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build an interaction-method-selected event payload (no logging). Emitted
 * when the user picks a method from the interaction picker. Logs both
 * endpoints of the transition so a query can derive whether the user
 * actually switched (`fromMethod !== toMethod`) and see the exact switch
 * pair; re-selecting the current method yields equal from/to.
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {string} [options.fromMethod] - The interaction method active
 *   before the selection (e.g. `dcapi`). A UI-choice enum, not personal data.
 * @param {string} [options.toMethod] - The interaction method chosen. A
 *   UI-choice enum, not personal data.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function presentationInteractionMethodSelected({
  clientId, exchangeId, fromMethod, toMethod
}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_interaction_method_selected',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined,
      ...(fromMethod && {fromMethod}),
      ...(toMethod && {toMethod})
    }
  };
}
