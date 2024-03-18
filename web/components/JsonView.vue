<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="q-pa-md">
    <div class="q-pb-none row justify-between">
      <div class="text-h6">
        {{title}}
      </div>
    </div>
    <vue-json-pretty
      :data="data"
      :show-icon="true"
      :show-line="false"
      :show-double-quotes="false"
      :deep="2">
      <template #renderNodeValue="{ defaultValue }">
        <JsonNode :value="defaultValue" />
      </template>
    </vue-json-pretty>
  </div>
</template>

<script setup>
/*!
 * Copyright (c) 2022-2023 Digital Bazaar, Inc. All rights reserved.
 */
import JsonNode from './JsonNode.vue';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
</script>
