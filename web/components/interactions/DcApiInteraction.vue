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
        :loading="active"
        :disabled="active"
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
import {
  extractCredentialFormats,
  filterWalletsByFormatSupport,
  getProtocolInteractionMethods
} from '../../../common/wallets/index.js';
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
import {computed} from 'vue';
import CountdownDisplay from '../CountdownDisplay.vue';
import WalletLaunchButton from '../WalletLaunchButton.vue';

const props = defineProps({
  exchangeData: {
    type: Object,
    required: true
  },
  active: {
    type: Boolean,
    default: false
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
  }
});

const emit = defineEmits(['activate', 'errorOverride', 'launch', 'retry']);

const compatibleWallets = computed(() => {
  // Extract credential formats from workflow
  const formats = extractCredentialFormats(props.workflow);
  if(formats.length === 0) {
    return [];
  }

  // Filter wallets by format support
  const compatibleWallets = filterWalletsByFormatSupport({
    walletIds: props.enabledWallets || [],
    formats,
    registry: props.walletsRegistry
  });

  // Filter for wallets that support DC API for available protocols
  const dcApiCompatible = [];
  for(const walletId of compatibleWallets) {
    // Check if wallet supports DC API for any available protocol
    for(const protocolId of props.availableProtocols) {
      // Skip protocols that don't support DC API
      if(['chapi', 'vcapi', 'interact'].includes(protocolId)) {
        continue;
      }

      // Check if wallet supports DC API for this protocol with mso_mdoc format
      // (DC API typically requires mso_mdoc)
      const combinations = getProtocolInteractionMethods({
        walletId,
        format: 'mso_mdoc',
        exchange: props.exchangeData,
        registry: props.walletsRegistry
      });

      const hasDcApi = combinations.some(c =>
        c.protocolId === protocolId && c.interactionMethod === 'dcapi'
      );

      if(hasDcApi) {
        dcApiCompatible.push({walletId, protocolId});
        break; // Found one protocol, move to next wallet
      }
    }
  }

  return dcApiCompatible;
});

// Determine if "Try Another Way" button should be shown
// Only show if workflow supports multiple credential formats
const shouldShowTryAnotherWay = computed(() => {
  const formats = extractCredentialFormats(props.workflow);
  // Show button if multiple formats are available (allowing fallback from
  // mso_mdoc to other formats like ldp_vc)
  return formats.length > 1;
});

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

