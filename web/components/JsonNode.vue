<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <span v-if="!state.expanded && value.length > 130">
    {{value.slice(0, 128)}}
    <span
      class="cursor-pointer bg-grey-3 q-px-xs"
      @click="expand">...</span>
  </span>
  <span v-else>
    {{value}}
  </span>
</template>

<script setup>
import {reactive} from 'vue';

defineProps({
  value: {
    type: String,
    required: true
  }
});

const state = reactive({expanded: false});

const expand = () => {
  state.expanded = true;
};
</script>
