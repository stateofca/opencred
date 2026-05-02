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
          :loading="!error && active"
          :disabled="!error && active"
          @click="handleRetry">
          {{$t('dcApiRetry')}}
        </cadmv-button>
        <cadmv-button
          v-if="shouldShowTryAnotherWay"
          variant="secondary"
          :loading="!error && active"
          :disabled="!error && active"
          @click="handleTryAnotherWay">
          {{$t('dcApiFallback')}}
        </cadmv-button>
      </div>
    </div>
    <!-- Normal State: wallet-branded launch buttons -->
    <div
      v-else
      class="flex flex-col gap-3 max-w-md mx-auto">
      <WalletLaunchButton
        v-for="entry in dcApiWallets"
        :key="entry.walletId"
        :wallet="entry.wallet"
        :wallet-id="entry.walletId"
        :protocol-id="entry.protocolId"
        :loading="active"
        :disabled="active"
        @launch="handleLaunch" />
      <p v-if="dcApiWallets.length === 0">
        No compatible wallet found.
      </p>
    </div>
    <!-- Countdown Display -->
    <p
      v-if="exchangeData?.createdAt && exchangeData?.ttl"
      class="text-gray-900 mt-4 q-mx-md text-center">
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
import WalletLaunchButton from '../WalletLaunchButton.vue';

const props = defineProps({
  exchangeData: {
    type: Object,
    required: true
  },
  walletsRegistry: {
    type: Object,
    default: () => ({})
  },
  active: {
    type: Boolean,
    default: false
  },
  error: {
    type: [Object, String],
    default: null
  },
  hasMultipleInteractionOptions: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits([
  'launch',
  'retry',
  'switchInteractionMethod'
]);

const dcApiWallets = computed(() => {
  const protocols = props.exchangeData?.protocols;
  if(!protocols || typeof protocols !== 'object') {
    return [];
  }

  const entries = [];
  for(const [walletId, wallet] of Object.entries(props.walletsRegistry)) {
    if(!wallet?.supportedProtocols) {
      continue;
    }
    for(const [protocolId, protocolConfig] of Object.entries(
      wallet.supportedProtocols)) {
      if(!protocolConfig?.dcapi) {
        continue;
      }
      if(protocols[protocolId]) {
        entries.push({walletId, protocolId, wallet});
        break;
      }
    }
  }
  return entries;
});

const shouldShowTryAnotherWay = computed(() => {
  return !!props.error && props.hasMultipleInteractionOptions;
});

const handleLaunch = ({walletId, protocolId}) => {
  emit('launch', {walletId, protocolId});
};

const handleTryAnotherWay = () => {
  emit('switchInteractionMethod', null);
};

const handleRetry = () => {
  emit('retry');
};
</script>
