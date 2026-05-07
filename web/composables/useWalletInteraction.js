/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {computed, reactive} from 'vue';
import {useExchangeOptions} from './useExchangeOptions.js';

const interactionState = reactive({
  dcApiError: null,
  activeOverride: false,
  activePickerEntryOverride: null
});

/**
 * Composable for wallet interaction state management.
 * Module-level singleton for picker entry selection.
 *
 * @returns {object} Interaction state and controls.
 */
export function useWalletInteraction() {
  const {exchangeOptions} = useExchangeOptions();

  const pickerEntries = computed(() => {
    if(!exchangeOptions.value) {
      return [];
    }
    return exchangeOptions.value.pickerEntries;
  });

  const activePickerEntry = computed(() => {
    if(interactionState.activePickerEntryOverride) {
      return interactionState.activePickerEntryOverride;
    }
    const entries = pickerEntries.value;
    return entries.length > 0 ? entries[0] : null;
  });

  const activeInteractionType = computed(() =>
    activePickerEntry.value?.method ?? null);

  const handlePickerSelect = entry => {
    if(typeof entry === 'object' && entry) {
      interactionState.activePickerEntryOverride = entry;
    } else if(typeof entry === 'string') {
      const match = pickerEntries.value.find(e => e.method === entry);
      if(match) {
        interactionState.activePickerEntryOverride = match;
      }
    }
    interactionState.activeOverride = true;
    interactionState.dcApiError = null;
  };

  const handleDcApiRetry = () => {
    interactionState.dcApiError = null;
    interactionState.activeOverride = true;
  };

  return {
    interactionState,
    pickerEntries,
    activePickerEntry,
    activeInteractionType,
    handlePickerSelect,
    handleDcApiRetry
  };
}
