<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="p-4 md:p-5 space-y-4 bg-white rounded-md">
    <h2 class="text-2xl md:text-3xl font-bold text-gray-900">
      {{title || $t('error_defaultTitle')}}
    </h2>

    <h3 class="text-lg md:text-xl font-medium text-gray-700">
      {{subtitle || $t('error_defaultSubtitle')}}
    </h3>

    <p class="text-base text-gray-600">
      {{message || $t('error_defaultMessage')}}
    </p>

    <div
      v-if="resettable"
      class="space-y-4">
      <p class="text-base text-gray-600">
        {{$t('exchangeResetTitle')}}
      </p>
      <cadmv-button
        variant="primary"
        @click="$emit('reset')">
        {{$t('exchangeReset')}}
      </cadmv-button>
    </div>
  </div>
</template>

<script setup>
import {CadmvButton} from '@digitalbazaar/cadmv-ui';

defineProps({
  title: {
    type: String,
    default: undefined
  },
  subtitle: {
    type: String,
    default: undefined
  },
  message: {
    type: String,
    default: undefined
  },
  resettable: {
    type: Boolean,
    default: () => false
  }
});

defineEmits(['reset']);
</script>
