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
    :class="[
      noFullWidth ? '' : 'w-full',
      'justify-start',
      noFullWidth ? '' : 'mx-auto'
    ]"
    @click="handleClick">
    <div class="flex items-center gap-3 flex-grow min-w-0 overflow-hidden">
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
      <span class="font-medium text-left truncate min-w-0">
        {{wallet?.name || walletId}}
      </span>
      <q-icon
        v-if="copyOnly"
        name="content_copy"
        size="24px"
        class="flex-shrink-0 ml-auto text-gray-600" />
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
  },
  copyOnly: {
    type: Boolean,
    default: false
  },
  noFullWidth: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['launch', 'copy']);

const handleClick = () => {
  const payload = {
    walletId: props.walletId,
    protocolId: props.protocolId
  };
  if(props.copyOnly) {
    emit('copy', payload);
  } else {
    emit('launch', payload);
  }
};
</script>
