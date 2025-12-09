<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="flex flex-col items-center justify-center">
    <!-- Error State -->
    <div
      v-if="error"
      class="flex flex-col items-center">
      <p class="text-red-600 mb-4 text-center">
        <span class="font-bold">
          Error receiving credential from wallet.
        </span>
        <br>
        <span class="text-sm">{{error.message || error}}</span>
      </p>
      <div class="flex gap-4">
        <cadmv-button
          variant="primary"
          :loading="exchangeState === 'active'"
          :disabled="exchangeState === 'active'"
          @click="handleRetry">
          {{$t('dcApiRetry')}}
        </cadmv-button>
        <cadmv-button
          variant="secondary"
          :loading="exchangeState === 'active'"
          :disabled="exchangeState === 'active'"
          @click="handleTryAnotherWay">
          {{$t('dcApiFallback')}}
        </cadmv-button>
      </div>
    </div>
    <!-- Normal State -->
    <cadmv-button
      v-else
      variant="primary"
      :loading="exchangeState === 'active'"
      :disabled="exchangeState === 'active'"
      @click="handleActivate">
      {{$t('appCta')}}
    </cadmv-button>
    <!-- Countdown Display -->
    <p
      v-if="exchangeData?.createdAt && exchangeData?.ttl"
      class="text-gray-900 mt-4">
      {{$t('exchangeActiveExpiryMessage')}}
      <CountdownDisplay
        :created-at="exchangeData.createdAt"
        :ttl="exchangeData.ttl" />
    </p>
  </div>
</template>

<script setup>
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
import CountdownDisplay from '../CountdownDisplay.vue';

defineProps({
  exchangeData: {
    type: Object,
    required: true
  },
  exchangeState: {
    type: String,
    default: 'pending'
  },
  dcApiState: {
    type: Object,
    default: () => ({})
  },
  error: {
    type: [Object, String],
    default: null
  }
});

const emit = defineEmits(['activate', 'errorOverride', 'retry']);

const handleActivate = () => {
  emit('activate');
};

const handleTryAnotherWay = () => {
  emit('errorOverride');
};

const handleRetry = () => {
  emit('retry');
};
</script>

