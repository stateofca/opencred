<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <cadmv-button
    variant="primary"
    :loading="loading"
    :disabled="disabled"
    class="w-full justify-start mx-auto"
    @click="handleLaunch">
    <div class="flex items-center gap-3 flex-grow min-w-0">
      <img
        v-if="wallet?.icon"
        :src="wallet.icon"
        :alt="wallet.name"
        class="w-8 h-8 rounded-sm flex-shrink-0">
      <q-icon
        v-else
        name="account_balance_wallet"
        size="32px"
        class="flex-shrink-0 text-gray-600" />
      <span class="font-medium text-left truncate">
        {{wallet?.name || walletId}}
      </span>
    </div>
  </cadmv-button>
</template>

<script setup>
import {CadmvButton} from '@digitalbazaar/cadmv-ui';

const props = defineProps({
  wallet: {
    type: Object,
    default: null
  },
  walletId: {
    type: String,
    required: true
  },
  protocolId: {
    type: String,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['launch']);

const handleLaunch = () => {
  emit('launch', {
    walletId: props.walletId,
    protocolId: props.protocolId
  });
};
</script>
