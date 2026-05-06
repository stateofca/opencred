/*
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {computed, readonly} from 'vue';

/**
 * Detects if the current window was opened programmatically (popup)
 * or accessed via direct navigation.
 *
 * @returns {{isPopupWindow: Readonly<import('vue').Ref<boolean>>,
 *   attemptClose: () => boolean}} Pop-up state: readonly `isPopupWindow` ref
 *   and `attemptClose` to close when opened as a popup.
 */
export function useWindowPopup() {
  /**
   * Checks if window was opened by another window via window.open().
   * Window.opener is set when opened via window.open(), null for direct
   * navigation.
   *
   * @returns {boolean} True when `window.opener` is non-null.
   */
  const isPopupWindow = computed(() => window.opener !== null);

  /**
   * Attempts to close the window.
   * Returns true if close succeeded, false otherwise.
   *
   * @returns {boolean} False when not a popup; after `window.close()`, whether
   *   `window.closed` is true.
   */
  const attemptClose = () => {
    if(!isPopupWindow.value) {
      return false;
    }

    window.close();

    return window.closed;
  };

  return {
    isPopupWindow: readonly(isPopupWindow),
    attemptClose
  };
}
