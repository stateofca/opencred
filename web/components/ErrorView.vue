<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<script setup>
defineProps({
  title: {
    type: String,
    default: () => 'Error',
  },
  message: {
    type: String,
    default: () => 'An error occurred.',
  },
  resettable: {
    type: Boolean,
    default: () => false,
  },
});

defineEmits(['reset']);
</script>

<template>
  <div class="p-4 md:p-5 space-y-2">
    <h2 class="text-4xl font-extrabold">
      {{title}}
    </h2>

    <p class="mb-4 text-lg font-normal text-gray-500">
      {{message}}
    </p>

    <p v-if="resettable">
      <button
        class="text-sm font-semibold text-blue-600 hover:text-blue-800"
        @click="$emit('reset')">
        {{$t('exchangeReset')}}
      </button>
    </p>
  </div>
</template>
