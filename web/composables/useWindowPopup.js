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
 * @returns {{isPopupWindow: Readonly<import('vue').Ref<boolean>>, attemptClose: () => boolean}}
 */
export function useWindowPopup() {
  /**
   * Checks if window was opened by another window via window.open().
   * window.opener is set when opened via window.open(), null for direct navigation.
   */
  const isPopupWindow = computed(() => window.opener !== null);

  /**
   * Attempts to close the window.
   * Returns true if close succeeded, false otherwise.
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
