/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Interaction-picker funnel reporting with a dismiss/select de-dup guard.
 *
 * The picker closes on both an explicit selection and a plain dismissal
 * (backdrop/ESC), so a naive "on close, report dismissed" would double-count
 * a selection as an abandonment. This composable tracks whether a selection
 * was made in the current open cycle and suppresses the dismissal report
 * accordingly. The guard re-arms on each open.
 *
 * Deliberately decoupled from `httpClient`/exchange context: the caller
 * supplies a `reportEvent(type, payload)` sink and a `getCurrentMethod()`
 * reader, keeping this logic pure and unit-testable without the network or
 * a mounted component.
 *
 * @param {object} options - Dependencies.
 * @param {(type: string, payload?: object) => void}
 *   options.reportEvent - Best-effort event sink.
 * @param {() => (string | undefined)} options.getCurrentMethod - Returns the
 *   interaction method currently active (e.g. `dcapi`, `qr-and-link`).
 * @returns {{onOpen: Function, onSelect: Function, onClose: Function}} Hooks
 *   to wire to the picker's open link, `@select`, and close/dismiss.
 */
export function usePickerReporting({reportEvent, getCurrentMethod}) {
  // True once a selection has been made in the current open cycle; checked
  // on close so a select is not also reported as a dismissal.
  let selectionMade = false;

  const onOpen = () => {
    selectionMade = false;
    reportEvent(
      'interaction_picker_opened', {method: getCurrentMethod()});
  };

  const onSelect = entry => {
    selectionMade = true;
    reportEvent('interaction_method_selected', {
      fromMethod: getCurrentMethod(),
      toMethod: entry?.method
    });
  };

  const onClose = () => {
    if(!selectionMade) {
      reportEvent(
        'interaction_picker_dismissed', {method: getCurrentMethod()});
    }
  };

  return {onOpen, onSelect, onClose};
}
