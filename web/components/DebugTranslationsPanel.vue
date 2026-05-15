<!--
Copyright 2026 California Department of Motor Vehicles
Copyright 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="row items-center q-gutter-x-sm q-mb-xs">
    <q-input
      v-model="filterText"
      dense
      outlined
      clearable
      placeholder="Filter keys or values…"
      class="col"
      style="max-width: 20rem">
      <template #prepend>
        <q-icon
          name="search"
          size="xs" />
      </template>
    </q-input>
    <q-checkbox
      v-model="changedOnly"
      dense
      label="Updated only" />
    <q-space />
    <q-btn
      flat
      dense
      size="sm"
      :label="copyLabel"
      :disable="!dirty"
      @click="copyChanges" />
    <q-btn
      v-if="dirty"
      flat
      dense
      size="sm"
      label="Reset all"
      color="negative"
      @click="resetAllTranslations" />
  </div>
  <div class="text-caption text-grey-6 q-mb-xs">
    Edits are temporary — refresh resets all changes.
  </div>
  <div class="col overflow-auto">
    <template
      v-for="row in filteredRows"
      :key="`${row.lang}:${row.key}`">
      <div
        class="row no-wrap items-center q-gutter-x-xs q-py-xs"
        style="border-bottom: 1px solid rgba(0, 0, 0, 0.06)">
        <q-badge
          :label="row.lang"
          outline
          color="grey-7"
          class="q-px-xs"
          style="font-size: 0.7rem" />
        <div
          class="text-caption text-weight-medium ellipsis"
          style="min-width: 8rem; max-width: 14rem"
          :title="row.key">
          {{row.key}}
        </div>
        <q-input
          :model-value="row.currentValue"
          dense
          borderless
          class="col q-px-xs debug-translations-row-input"
          input-class="text-caption"
          @update:model-value="
            setTranslation({
              lang: row.lang,
              key: row.key,
              value: $event,
            })
          " />
        <q-btn
          v-if="row.changed"
          icon="undo"
          flat
          round
          dense
          size="xs"
          color="grey-7"
          @click="
            resetTranslation({
              lang: row.lang,
              key: row.key,
            })
          " />
      </div>
      <div
        v-if="row.changed"
        class="text-caption text-grey-5 q-pl-xl q-pb-xs"
        style="font-size: 0.65rem; margin-top: -2px">
        was: {{row.originalValue}}
      </div>
    </template>
    <div
      v-if="filteredRows.length === 0"
      class="text-caption text-grey-6 q-pa-md text-center">
      No matching translation keys.
    </div>
  </div>
</template>

<script setup>
/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {computed, ref} from 'vue';
import {filterTranslationRows} from '../utils/debug-translations.js';
import {useDebugTranslations} from '../composables/useDebugTranslations.js';

const {
  rows,
  dirty,
  yamlText,
  setTranslation,
  resetTranslation,
  resetAllTranslations
} = useDebugTranslations();

const filterText = ref('');
const changedOnly = ref(false);
const copyLabel = ref('Copy changes');

const filteredRows = computed(() =>
  filterTranslationRows({
    rows: rows.value,
    filter: filterText.value,
    changedOnly: changedOnly.value
  })
);

async function copyChanges() {
  try {
    await navigator.clipboard.writeText(yamlText.value);
    copyLabel.value = 'Copied!';
    setTimeout(() => {
      copyLabel.value = 'Copy changes';
    }, 1500);
  } catch {
    copyLabel.value = 'Copy failed';
    setTimeout(() => {
      copyLabel.value = 'Copy changes';
    }, 1500);
  }
}
</script>

<style scoped>
.debug-translations-row-input :deep(.q-field__control) {
  border-radius: 4px;
  transition: box-shadow 0.12s ease-in-out;
}

.debug-translations-row-input :deep(.q-field--focused .q-field__control),
.debug-translations-row-input:focus-within :deep(.q-field__control) {
  box-shadow: 0 0 0 2px var(--q-primary);
}
</style>
