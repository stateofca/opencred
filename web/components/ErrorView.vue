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
  subtitle: {
    type: String,
    default: () => 'The following error was encountered:',
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
  <div class="p-4 md:p-5 space-y-4">
    <h2 class="text-2xl md:text-3xl font-bold text-gray-900">
      {{title}}
    </h2>

    <h3 class="text-lg md:text-xl font-medium text-gray-700">
      {{subtitle}}
    </h3>

    <p class="text-base text-gray-600">
      {{message}}
    </p>

    <div
      v-if="resettable"
      class="space-y-2">
      <p class="text-base text-gray-600">
        {{$t('exchangeResetTitle')}}
      </p>
      <q-btn
        color="primary"
        @click="$emit('reset')">
        {{$t('exchangeReset')}}
      </q-btn>
    </div>
  </div>
</template>
