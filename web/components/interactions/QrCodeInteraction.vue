<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="mb-4 justify-center text-center">
    <!-- Wallet Selection (if multiple wallets available) -->
    <div
      v-if="compatibleWallets.length > 1"
      class="mb-6">
      <p class="text-sm font-medium mb-3 text-gray-900">
        Select a wallet:
      </p>
      <div
        class="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3
               lg:max-w-2xl lg:mx-auto">
        <button
          v-for="{walletId, protocolId} in compatibleWallets"
          :key="walletId"
          type="button"
          class="flex items-center gap-3 p-3 rounded-md border-2 transition-all
                 text-left"
          :class="selectedWalletId === walletId ?
            'border-primary bg-primary/10 ring-2 ring-primary/20' :
            'border-gray-300 hover:border-gray-400'"
          @click="handleWalletSelect(walletId, protocolId)">
          <img
            v-if="walletsRegistry?.[walletId]?.icon"
            :src="walletsRegistry[walletId].icon"
            :alt="walletsRegistry[walletId].name"
            class="w-8 h-8 rounded-sm flex-shrink-0">
          <q-icon
            v-else
            name="account_balance_wallet"
            size="32px"
            class="flex-shrink-0 text-gray-600" />
          <span class="font-medium text-gray-900">
            {{walletsRegistry?.[walletId]?.name || walletId}}
          </span>
        </button>
      </div>
    </div>
    <div
      class="relative-position mx-auto"
      :style="{
        maxWidth: '320px',
        minHeight: '320px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }">
      <p
        v-if="$t('qrPageExplainHelp') !== ''"
        class="mt-2 text-gray-900"
        v-html="$t('qrPageExplainHelp')" />
      <img
        v-if="localQrCodeDataUri && !isGeneratingQr"
        :src="localQrCodeDataUri"
        class="mx-auto"
        :style="{ opacity: active ? 0.2 : 1 }">
      <q-spinner-tail
        v-if="active || isGeneratingQr"
        class="no-pointer-events absolute-center text-primary"
        size="5em" />
    </div>
    <p class="text-gray-900 mt-4">
      {{$t('exchangeActiveExpiryMessage')}}
      <CountdownDisplay
        v-if="exchangeData?.createdAt && exchangeData?.ttl"
        :created-at="exchangeData.createdAt"
        :ttl="exchangeData.ttl" />
    </p>
    <button
      v-if="active"
      class="mx-auto max-w-prose text-sm underline text-gray-900 mt-2"
      @click="handleGoBack">
      {{$t('exchangeActiveGoBack')}}
    </button>
    <div
      v-if="!exchangeData?.state || exchangeData?.state !== 'complete'"
      class="mt-4">
      <cadmv-button
        no-caps
        variant="flat"
        label="Launch on this device"
        @click="handleToggleSameDevice" />
    </div>
    <!-- Disclaimer -->
    <div
      v-if="$t('qrDisclaimer')"
      class="mt-12 flex flex-col items-center text-gray-900"
      v-html="$t('qrDisclaimer')" />
  </div>
</template>

<script setup>
import {
  extractCredentialFormats,
  getProtocolInteractionMethods
} from '../../../common/wallets/index.js';
import {ref, watch} from 'vue';
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
import CountdownDisplay from '../CountdownDisplay.vue';
import QRCode from 'qrcode';
import {QSpinnerTail} from 'quasar';

const props = defineProps({
  exchangeData: {
    type: Object,
    default: () => ({
      createdAt: null,
      ttl: null
    })
  },
  active: {
    type: Boolean,
    default: false
  },
  walletsRegistry: {
    type: Object,
    default: () => ({})
  },
  compatibleWallets: {
    type: Array,
    default: () => []
  },
  workflow: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['toggleSameDevice', 'goBack']);

// Internal selection state
const selectedWalletId = ref(null);
const selectedProtocolId = ref(null);

// Local QR code data URI that updates when wallet changes
const localQrCodeDataUri = ref('');
const isGeneratingQr = ref(false);

// Initialize selection to first wallet if available
watch(() => props.compatibleWallets, wallets => {
  if(wallets.length > 0 && !selectedWalletId.value) {
    selectedWalletId.value = wallets[0].walletId;
    selectedProtocolId.value = wallets[0].protocolId;
  }
}, {immediate: true});

// Get wallet-specific QR URL
const getWalletQrUrl = async (walletId, protocolId) => {
  if(!walletId || !protocolId || !props.workflow) {
    return props.exchangeData?.protocols?.[protocolId] ||
      props.exchangeData?.OID4VP || '';
  }

  // Extract credential formats from workflow
  const formats = extractCredentialFormats(props.workflow);
  if(formats.length === 0) {
    return props.exchangeData?.protocols?.[protocolId] ||
      props.exchangeData?.OID4VP || '';
  }

  // Try to get wallet-specific URL
  for(const format of formats) {
    const combinations = getProtocolInteractionMethods({
      walletId,
      format,
      exchange: props.exchangeData,
      registry: props.walletsRegistry
    });

    const matching = combinations.find(c =>
      c.protocolId === protocolId && c.interactionMethod === 'qr'
    );

    if(matching && matching.request) {
      return typeof matching.request === 'string' ? matching.request :
        matching.request;
    }
  }

  // Fallback to default protocol URL
  return props.exchangeData?.protocols?.[protocolId] ||
    props.exchangeData?.OID4VP || '';
};

// Generate QR code for selected wallet
const generateQrCode = async (walletId, protocolId) => {
  isGeneratingQr.value = true;
  try {
    const url = await getWalletQrUrl(walletId, protocolId);
    if(url) {
      localQrCodeDataUri.value = await QRCode.toDataURL(url);
    } else {
      // Fallback to exchange data QR if available
      const exchangeQr = props.exchangeData?.QR;
      if(exchangeQr) {
        localQrCodeDataUri.value = exchangeQr;
      } else {
        localQrCodeDataUri.value = '';
      }
    }
  } catch(error) {
    console.error('Error generating QR code:', error);
    // Fallback to exchange data QR if available
    const exchangeQr = props.exchangeData?.QR;
    localQrCodeDataUri.value = exchangeQr || '';
  } finally {
    isGeneratingQr.value = false;
  }
};

// Watch for wallet selection changes
watch([selectedWalletId, selectedProtocolId],
  async ([walletId, protocolId]) => {
    if(walletId && protocolId) {
      await generateQrCode(walletId, protocolId);
    } else {
      // Fallback to exchange data QR if available
      const exchangeQr = props.exchangeData?.QR;
      localQrCodeDataUri.value = exchangeQr || '';
    }
  },
  {immediate: true}
);

// Watch for exchange data QR changes (fallback when no wallet selected)
watch(() => props.exchangeData?.QR, newQr => {
  if(!isGeneratingQr.value && !selectedWalletId.value) {
    localQrCodeDataUri.value = newQr || '';
  }
}, {immediate: true});

const handleWalletSelect = (walletId, protocolId) => {
  // Update internal state only
  selectedWalletId.value = walletId;
  selectedProtocolId.value = protocolId;
};

const handleToggleSameDevice = () => {
  emit('toggleSameDevice');
};

const handleGoBack = () => {
  emit('goBack');
};
</script>

