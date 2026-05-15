<!--
Copyright 2026 California Department of Motor Vehicles
Copyright 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="debug-info-grid">
    <div class="debug-info-grid__sidebar">
      <q-markup-table
        dense
        flat
        bordered
        class="q-mb-xs">
        <thead>
          <tr>
            <th
              colspan="2"
              class="text-left text-caption
                text-weight-bold">
              State
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in stateRows"
            :key="row.label">
            <td class="text-caption text-grey-7">
              {{row.label}}
            </td>
            <td class="text-caption font-mono">
              {{String(row.value)}}
            </td>
          </tr>
        </tbody>
      </q-markup-table>

      <q-markup-table
        v-if="interactionRows.length"
        dense
        flat
        bordered
        class="q-mb-xs">
        <thead>
          <tr>
            <th
              colspan="2"
              class="text-left text-caption
                text-weight-bold">
              Interaction
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in interactionRows"
            :key="row.label">
            <td class="text-caption text-grey-7">
              {{row.label}}
            </td>
            <td class="text-caption font-mono">
              {{String(row.value)}}
            </td>
          </tr>
        </tbody>
      </q-markup-table>

      <q-markup-table
        v-if="workflowRows.length"
        dense
        flat
        bordered
        class="q-mb-xs">
        <thead>
          <tr>
            <th
              colspan="2"
              class="text-left text-caption
                text-weight-bold">
              Workflow
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in workflowRows"
            :key="row.label">
            <td class="text-caption text-grey-7">
              {{row.label}}
            </td>
            <td class="text-caption font-mono">
              {{String(row.value)}}
            </td>
          </tr>
        </tbody>
      </q-markup-table>

      <div
        v-if="pickerRows.length"
        class="debug-info-section q-mb-xs">
        <div
          class="text-caption text-weight-bold
          q-mb-xs">
          Picker Entries
        </div>
        <div
          v-for="row in pickerRows"
          :key="row.label"
          class="q-mb-xs">
          <q-badge
            color="grey-4"
            text-color="dark"
            class="q-mr-xs">
            {{row.label}}
          </q-badge>
          <span
            v-for="(v, k) in row.values"
            :key="k"
            class="text-caption q-mr-sm">
            <span class="text-grey-7">{{k}}</span>=<code>{{v}}</code>
          </span>
        </div>
      </div>

      <div
        v-if="hasRequestJson"
        class="debug-info-section q-mb-xs">
        <div
          class="text-caption text-weight-bold
          q-mb-xs">
          Workflow Request
        </div>
        <pre
          class="debug-info-json
          debug-info-json--sm">{{requestJsonText}}</pre>
      </div>
    </div>

    <div class="debug-info-grid__main">
      <div
        class="text-caption text-weight-bold
        q-mb-xs">
        Exchange Data
      </div>
      <pre
        class="debug-info-json
        debug-info-json--lg">{{exchangeJsonText}}</pre>
    </div>
  </div>
</template>

<script setup>
import {useDebugInfo} from '../composables/useDebugInfo.js';

const {
  stateRows,
  interactionRows,
  workflowRows,
  pickerRows,
  hasRequestJson,
  requestJsonText,
  exchangeJsonText,
  copyPayload
} = useDebugInfo();

defineExpose({copyPayload});
</script>

<style>
.debug-info-grid {
  display: grid;
  grid-template-columns: minmax(14rem, 1fr) 2fr;
  gap: 0.5rem;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.debug-info-grid__sidebar {
  overflow-y: auto;
  min-height: 0;
}

.debug-info-grid__main {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.debug-info-json {
  font-family: monospace;
  font-size: 0.7rem;
  white-space: pre-wrap;
  word-break: break-all;
  background: #f5f5f5;
  border-radius: 4px;
  padding: 0.5rem;
  margin: 0;
}

.debug-info-json--sm {
  max-height: 16rem;
  overflow-y: auto;
}

.debug-info-json--lg {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

.debug-info-section {
  padding: 0 0.25rem;
}

@media (max-width: 48rem) {
  .debug-info-grid {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .debug-info-json--lg {
    min-height: 20rem;
  }
}
</style>
