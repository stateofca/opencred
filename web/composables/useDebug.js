/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {computed, ref, watch, watchEffect} from 'vue';
import {useMagicKeys, useToggle} from '@vueuse/core';
import {useExchangeContext} from './useExchangeContext.js';

const showDebug = ref(false);

/**
 * Set `true` in source to trace Shift+/ without URL/session (remember to set
 * back to `false` before commit).
 */
const FORCE_DEBUG_SHORTCUT_LOG = false;

/**
 * Whether verbose logging for the debug shortcut is on.
 * Enable with `?debugShortcutLog=1` on the page URL, or in devtools:
 * `sessionStorage.setItem('opencred-debug-shortcut-log', '1')` then reload.
 *
 * @returns {boolean} True when shortcut diagnostic logging should run.
 */
export function isDebugShortcutLoggingEnabled() {
  if(typeof window === 'undefined') {
    return false;
  }
  if(FORCE_DEBUG_SHORTCUT_LOG) {
    return true;
  }
  try {
    if(new URLSearchParams(window.location.search).get('debugShortcutLog') ===
      '1') {
      return true;
    }
    if(window.sessionStorage?.getItem('opencred-debug-shortcut-log') ===
      '1') {
      return true;
    }
  } catch {
    // ignore storage / URL errors
  }
  return false;
}

/**
 * Composable for debug mode toggle via Shift+/ (?) keyboard shortcut.
 * Only active when debug is enabled in workflow options.
 *
 * @returns {object} Debug display state.
 */
export function useDebug() {
  const {context} = useExchangeContext();
  const keys = useMagicKeys();

  // On macOS this will be Cmd+Shift+/
  // On Windows/Linux this will be Ctrl+Shift+/
  const debugKey = keys['`'];

  const toggleDebug = useToggle(showDebug);

  const debugEnabled = computed(() => {
    const ctx = context?.value;
    if(!ctx) {
      return false;
    }
    return ctx.options?.debug === true ||
      ctx.workflow?.debug === true ||
      false;
  });

  if(isDebugShortcutLoggingEnabled()) {
    watch(
      () => ({v: debugEnabled.value, o: context?.value?.options?.debug,
        w: context?.value?.workflow?.debug, hasCtx: !!context?.value}),
      state => {
        console.log('[useDebug] debugEnabled / context', state);
      },
      {immediate: true}
    );
    watch(debugKey, (pressed, was) => {
      console.log('[useDebug] hotkey (backtick) pressed', {pressed, was});
    });
    watch(
      () => [debugEnabled.value, debugKey.value],
      ([en, key]) => {
        console.log('[useDebug] combo state', {
          debugEnabled: en,
          debugKeyPressed: key,
          willToggle: en && key
        });
      },
      {immediate: true}
    );
  }

  watchEffect(() => {
    if(debugEnabled.value && debugKey.value) {
      if(isDebugShortcutLoggingEnabled()) {
        console.log('[useDebug] toggling showDebug');
      }
      toggleDebug();
    }
  });

  return {showDebug};
}
