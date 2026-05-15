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
    <q-tabs
      v-model="activeTab"
      dense
      class="text-grey"
      active-color="primary"
      indicator-color="primary"
      align="left"
      narrow-indicator>
      <q-tab
        name="info"
        label="Info" />
      <q-tab
        name="translations"
        label="Translations" />
    </q-tabs>
    <q-separator />
    <q-tab-panels
      v-model="activeTab"
      animated
      class="debug-modal__panels">
      <q-tab-panel
        name="info"
        class="column full-height q-pa-sm">
        <DebugInfoPanel ref="infoPanel" />
      </q-tab-panel>
      <q-tab-panel
        name="translations"
        class="column full-height q-pa-sm">
        <DebugTranslationsPanel />
      </q-tab-panel>
    </q-tab-panels>
    <q-card-actions align="right">
      <q-btn
        v-if="activeTab === 'info'"
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
import {ref} from 'vue';
import {useDebug} from '../composables/useDebug.js';

import DebugInfoPanel from './DebugInfoPanel.vue';
import DebugTranslationsPanel from './DebugTranslationsPanel.vue';
import ModalDialog from './ModalDialog.vue';

const {showDebug} = useDebug();

const activeTab = ref('info');
const copyLabel = ref('Copy');
const infoPanel = ref(null);

async function copyDebug() {
  try {
    const text = infoPanel.value?.copyPayload ?? '';
    await navigator.clipboard.writeText(text);
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

.debug-modal .debug-modal__panels {
  flex: 1 1 0;
  min-height: 0;
}

@media (min-width: 2048px) {
  .q-dialog__inner--minimized:has(> .debug-modal) {
    justify-content: flex-end;
  }
  .q-dialog__inner--minimized > div.debug-modal {
    width: 48vw;
  }

  /* Shift page layout left so content centers in the remaining space
     beside the debug modal. */
  body:has(.debug-modal) .opencred-main-container {
    padding-right: 32vw;
  }

  /* Transparent backdrop so page content is visible alongside the modal. */
  .q-dialog:has(.debug-modal) .q-dialog__backdrop {
    background: transparent;
  }
}
</style>
