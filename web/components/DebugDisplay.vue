<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <ModalDialog
    v-model="showDebug"
    card-class="debug-modal">
    <q-card-section class="row items-center q-pb-none">
      <div class="text-h6">
        Debug Info
      </div>
      <q-space />
      <q-btn
        icon="close"
        flat
        round
        dense
        @click="showDebug = false" />
    </q-card-section>
    <q-card-section class="q-pt-sm column flex-grow overflow-hidden">
      <textarea
        readonly
        :value="debugText"
        class="w-full flex-grow font-mono text-xs overflow-auto"
        style="resize: none;" />
    </q-card-section>
    <q-card-actions align="right">
      <q-btn
        flat
        :label="copyLabel"
        @click="copyDebug" />
      <q-btn
        flat
        label="Close"
        @click="showDebug = false" />
    </q-card-actions>
  </ModalDialog>
</template>

<script setup>
import {computed, ref} from 'vue';
import {useDebug} from '../composables/useDebug.js';
import {useExchange} from '../composables/useExchange.js';
import {useWalletInteraction} from '../composables/useWalletInteraction.js';

import ModalDialog from './ModalDialog.vue';

const {showDebug} = useDebug();
const {
  exchangeData, exchangeState, workflow, dcApiSystemAvailable, isActive
} = useExchange();
const {
  activePickerEntry, activeInteractionType, pickerEntries, interactionState
} = useWalletInteraction();

const copyLabel = ref('Copy');

const debugText = computed(() => {
  const sections = [
    `active interaction type: ${activeInteractionType.value ?? 'null'}`,
    `active picker entry: ${JSON.stringify(activePickerEntry.value, null, 2)}`,
    `state: ${exchangeState.value}`,
    `active: ${isActive.value}`,
    '',
    'interaction state:',
    `dcApiError=${interactionState.value?.dcApiError}`,
    `dcapi system available: ${dcApiSystemAvailable.value}`,
    '',
    `picker entries: ${JSON.stringify(pickerEntries.value, null, 2)}`,
    '',
    `exchange data:\n${JSON.stringify(exchangeData.value, null, 2)}`,
    '',
    `workflow:\n${JSON.stringify(workflow.value, null, 2)}`
  ];
  return sections.join('\n');
});

async function copyDebug() {
  try {
    await navigator.clipboard.writeText(debugText.value);
    copyLabel.value = 'Copied!';
    setTimeout(() => {
      copyLabel.value = 'Copy';
    }, 1500);
  } catch(e) {
    console.error('[DebugDisplay] clipboard write failed', e);
  }
}
</script>

<style>
.q-dialog__inner--minimized > div.debug-modal {
  width: 95vw;
  max-width: 100rem;
  height: 90vh;
  display: flex;
  flex-direction: column;
}
</style>
