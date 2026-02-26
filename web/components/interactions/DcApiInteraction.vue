<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

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
          :loading="!error && exchangeState === 'active'"
          :disabled="!error && exchangeState === 'active'"
          @click="handleRetry">
          {{$t('dcApiRetry')}}
        </cadmv-button>
        <cadmv-button
          variant="secondary"
          :loading="!error && exchangeState === 'active'"
          :disabled="!error && exchangeState === 'active'"
          @click="handleTryAnotherWay">
          {{$t('dcApiFallback')}}
        </cadmv-button>
      </div>
    </div>
    <!-- Normal State: wallet launch buttons -->
    <div
      v-else
      class="flex flex-col gap-3 w-full max-w-md mx-auto">
      <WalletLaunchButton
        v-for="{walletId, protocolId} in compatibleWallets"
        :key="walletId"
        :wallet="walletsRegistry?.[walletId]"
        :wallet-id="walletId"
        :protocol-id="protocolId"
        :loading="exchangeState === 'active' && walletId === selectedWallet"
        :disabled="exchangeState === 'active'"
        @launch="handleLaunch" />
    </div>
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
import {computed} from 'vue';
import CountdownDisplay from '../CountdownDisplay.vue';
import {getDcApiCompatibleWallets} from '../../utils/wallets.js';
import WalletLaunchButton from '../WalletLaunchButton.vue';

const props = defineProps({
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
  },
  walletsRegistry: {
    type: Object,
    default: () => ({})
  },
  availableProtocols: {
    type: Array,
    default: () => []
  },
  workflow: {
    type: Object,
    default: null
  },
  enabledWallets: {
    type: Array,
    default: null
  },
  selectedWallet: {
    type: String,
    default: null
  }
});

const emit = defineEmits(['activate', 'errorOverride', 'launch', 'retry']);

const compatibleWallets = computed(() =>
  getDcApiCompatibleWallets({
    walletsRegistry: props.walletsRegistry,
    availableProtocols: props.availableProtocols,
    workflow: props.workflow,
    enabledWallets: props.enabledWallets
  }));

const handleLaunch = ({walletId, protocolId}) => {
  emit('launch', {walletId, protocolId});
};

const handleTryAnotherWay = () => {
  emit('errorOverride');
};

const handleRetry = () => {
  emit('retry');
};
</script>

