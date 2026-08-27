/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Switch-link logic: which picker entry the persistent switch control points
 * at, and what it is labelled when it points there. Kept pure and free of Vue
 * and i18n plumbing — the caller passes the entries, the active entry, and a
 * `translate` function — so it is unit-testable without a mounted component,
 * mirroring `usePickerReporting`.
 *
 * The switch control is the same top-level link that used to open the picker
 * modal. When a deployment hides the picker (`connectionPickerEnabled: false`)
 * the link advances directly to the next connection option and wraps, so with
 * two options it toggles and with more it cycles — every option reachable from
 * every other with no reciprocal affordance.
 */

/**
 * The picker entry the switch control advances to from the active one,
 * cycling with wraparound over the ordered `pickerEntries`.
 *
 * Returns `null` when there is nowhere to go — fewer than two options, so the
 * control has no destination and does not render. This is a control with
 * nothing to point at, not count-based UI branching. The entries are already
 * the selected, viable, ordered set from `computeExchangeOptions`, so every one
 * is a genuine destination; no further viability filtering happens here.
 *
 * @param {Array<object>} entries - The ordered picker entries.
 * @param {object} [activeEntry] - The currently-active entry. When it matches
 *   none of `entries` (or is absent), the first entry is the destination.
 * @returns {object|null} The next entry, wrapping, or `null` when fewer than
 *   two entries exist.
 */
export function nextPickerEntry(entries, activeEntry) {
  if(!Array.isArray(entries) || entries.length < 2) {
    return null;
  }
  const activeIdx = activeEntry ?
    entries.findIndex(e =>
      e.method === activeEntry.method &&
      (e.profile ?? null) === (activeEntry.profile ?? null)) :
    -1;
  // A missing active entry (activeIdx === -1) advances to the first entry.
  return entries[(activeIdx + 1) % entries.length];
}

/**
 * The switch-control label when it points at `entry` — what the link says when
 * it points at that destination. Precedence, mirroring the modal's own label
 * resolution: the entry's `destinationLabelKey` when it resolves in the current
 * locale, else its literal `destinationLabel`, else the per-method default key
 * `switchLink_destination_<method>`, else the method's own interaction label,
 * else the raw method. The declaration's per-option overrides
 * (`destinationLabelKey` / `destinationLabel`) are carried onto the entry by
 * `_selectAndOrderPickerEntries`.
 *
 * @param {object} options - Options.
 * @param {object} options.entry - The destination picker entry.
 * @param {(key: string) => string} options.t - Translator; returns the key
 *   unchanged when it does not resolve, matching vue-i18n's default.
 * @returns {string} The resolved destination label, `''` for no entry.
 */
export function switchLinkDestinationLabel({entry, t}) {
  if(!entry) {
    return '';
  }
  if(entry.destinationLabelKey &&
    t(entry.destinationLabelKey) !== entry.destinationLabelKey) {
    return t(entry.destinationLabelKey);
  }
  if(entry.destinationLabel) {
    return entry.destinationLabel;
  }
  const defaultKey = `switchLink_destination_${entry.method}`;
  const defaultLabel = t(defaultKey);
  if(defaultLabel !== defaultKey) {
    return defaultLabel;
  }
  const methodKey = `interactionMethod_${entry.method}`;
  const methodLabel = t(methodKey);
  return methodLabel !== methodKey ? methodLabel : entry.method;
}
