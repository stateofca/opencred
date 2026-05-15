/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  getWorkflowRequestJson,
  omitWorkflowTranslations,
  summarizeInteractionState,
  summarizePickerEntries,
  summarizeWorkflow
} from '../utils/debug-info.js';
import {computed} from 'vue';
import {useExchange} from './useExchange.js';
import {useWalletInteraction} from
  './useWalletInteraction.js';

/**
 * Composable that gathers debug info view-model objects
 * for the Info tab panel.
 *
 * @returns {object} Debug info view-model.
 */
export function useDebugInfo() {
  const {
    exchangeData, exchangeState, workflow,
    dcApiSystemAvailable, isActive
  } = useExchange();
  const {
    activePickerEntry, activeInteractionType,
    pickerEntries, interactionState
  } = useWalletInteraction();

  const stateRows = computed(() => {
    const entry = activePickerEntry.value;
    return [
      {
        label: 'interactionType',
        value: activeInteractionType.value ?? 'null'
      },
      {
        label: 'exchangeState',
        value: exchangeState.value
      },
      {label: 'active', value: isActive.value},
      {
        label: 'dcApiAvailable',
        value: dcApiSystemAvailable.value
      },
      {
        label: 'activeEntry',
        value: entry?.name ??
          entry?.method ?? 'none'
      }
    ];
  });

  const interactionRows = computed(() =>
    summarizeInteractionState({interactionState}));

  const workflowRows = computed(() =>
    summarizeWorkflow({workflow: workflow.value}));

  const pickerRows = computed(() =>
    summarizePickerEntries({
      pickerEntries: pickerEntries.value
    }));

  const requestJson = computed(() =>
    getWorkflowRequestJson({
      workflow: workflow.value
    }));

  const hasRequestJson = computed(() =>
    Object.keys(requestJson.value).length > 0);

  const requestJsonText = computed(() =>
    JSON.stringify(requestJson.value, null, 2));

  const exchangeJsonText = computed(() =>
    JSON.stringify(exchangeData.value, null, 2));

  const copyPayload = computed(() => {
    const wf = workflow.value;
    const payload = {
      state: {
        interactionType:
          activeInteractionType.value,
        exchangeState: exchangeState.value,
        active: isActive.value,
        dcApiAvailable:
          dcApiSystemAvailable.value,
        activePickerEntry:
          activePickerEntry.value
      },
      interactionState: {
        ...interactionState
      },
      workflow: wf ?
        omitWorkflowTranslations({workflow: wf}) :
        null,
      pickerEntries: pickerEntries.value,
      exchangeData: exchangeData.value
    };
    return JSON.stringify(payload, null, 2);
  });

  return {
    stateRows,
    interactionRows,
    workflowRows,
    pickerRows,
    hasRequestJson,
    requestJsonText,
    exchangeJsonText,
    copyPayload
  };
}
