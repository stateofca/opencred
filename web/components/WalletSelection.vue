<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="wallet-selection">
    <div class="border border-gray-200 rounded-lg p-3 mb-4 bg-gray-50">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 flex-grow min-w-0">
          <img
            v-if="selectedWallet && walletInfo?.icon"
            :src="walletInfo.icon"
            :alt="walletInfo.name"
            class="w-10 h-10 rounded-lg flex-shrink-0">
          <h3 class="font-semibold text-gray-900 text-base">
            <template v-if="selectedWallet">
              {{walletInfo?.name || selectedWallet}}
            </template>
            <template v-else>
              {{protocolsRegistry[selectedProtocol]?.name || selectedProtocol}}
            </template>
          </h3>
        </div>
        <q-btn
          flat
          size="sm"
          label="Change"
          class="text-gray-600 hover:text-gray-900 flex-shrink-0"
          @click="showDialog = true" />
      </div>
    </div>
    <CadmvDialog
      v-if="showDialog"
      :actions="dialogActions"
      @action="handleDialogAction">
      <template #body>
        <div class="wallet-protocol-selection relative">
          <q-btn
            flat
            dense
            round
            icon="close"
            class="absolute top-0 right-0 text-gray-500 hover:text-gray-900 z-10"
            style="margin-top: -8px; margin-right: -8px;"
            @click="showDialog = false" />
          <div class="mb-4">
            <p class="font-semibold mb-3 text-gray-900">
              Select Wallet
            </p>
            <div
              v-for="(wallet, walletId) in walletsRegistry"
              :key="walletId"
              class="mb-3 p-3 border border-gray-200 rounded-lg"
              :class="{
                'bg-blue-50 border-blue-300': selectedWallet === walletId
              }">
              <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div class="flex items-center gap-3 flex-grow min-w-0">
                  <img
                    v-if="wallet.icon"
                    :src="wallet.icon"
                    :alt="wallet.name"
                    class="w-8 h-8 rounded-lg flex-shrink-0">
                  <div class="flex-grow text-left min-w-0">
                    <div class="font-medium text-gray-900">
                      {{wallet.name}}
                    </div>
                    <div
                      v-if="wallet.description"
                      class="text-xs text-gray-600 mt-1">
                      {{wallet.description}}
                    </div>
                    <div
                      v-if="wallet.appStoreLinks"
                      class="flex gap-2 mt-2">
                      <a
                        v-if="wallet.appStoreLinks.googlePlay"
                        :href="wallet.appStoreLinks.googlePlay"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-block">
                        <img
                          src="/google-play-button.png"
                          alt="Get it on Google Play"
                          class="h-8">
                      </a>
                      <a
                        v-if="wallet.appStoreLinks.ios"
                        :href="wallet.appStoreLinks.ios"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-block">
                        <img
                          src="/apple-app-store-button.png"
                          alt="Download on the App Store"
                          class="h-8">
                      </a>
                    </div>
                  </div>
                </div>
                <div class="w-full lg:w-auto flex justify-end">
                  <q-btn
                    flat
                    dense
                    size="sm"
                    label="Select"
                    class="flex-shrink-0"
                    :class="selectedWallet === walletId ?
                      'text-blue-700' : 'text-gray-600'"
                    @click="handleWalletSelect(walletId)" />
                </div>
              </div>
            </div>
          </div>
          <div>
            <p class="font-semibold text-gray-900">
              Or select protocol (advanced)
            </p>
            <p class="text-xs text-gray-600 mb-3">
              Wallets may support one or more of the following protocols.
            </p>
            <div
              v-for="protocolId in availableProtocols"
              :key="protocolId"
              class="mb-3 p-3 border rounded-lg"
              :class="{
                'bg-blue-50 border-blue-300': selectedProtocol === protocolId && !selectedWallet,
                'border-green-300 bg-green-50': selectedWallet && 
                  isProtocolSupported(protocolId) && 
                  selectedProtocol !== protocolId
              }">
              <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div class="flex-grow text-left min-w-0">
                  <div class="font-medium text-gray-900">
                    {{protocolsRegistry[protocolId]?.name || protocolId}}
                  </div>
                  <div
                    v-if="protocolsRegistry[protocolId]?.description"
                    class="text-xs text-gray-600 mt-1">
                    {{protocolsRegistry[protocolId].description}}
                  </div>
                </div>
                <div class="w-full lg:w-auto flex items-center justify-end gap-2">
                  <span
                    v-if="selectedWallet && 
                      isProtocolSupported(protocolId)"
                    class="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded whitespace-nowrap">
                    Supported by {{walletInfo?.name || selectedWallet}}
                  </span>
                  <q-btn
                    flat
                    dense
                    size="sm"
                    label="Select"
                    :class="selectedProtocol === protocolId ?
                      'text-blue-700' : 'text-gray-600'"
                    @click="handleProtocolSelect(protocolId)" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </CadmvDialog>
  </div>
</template>

<script setup>
import {computed, ref} from 'vue';
import {CadmvDialog} from '@digitalbazaar/cadmv-ui';
import {PROTOCOLS_REGISTRY} from '../utils/protocols.js';
import {WALLETS_REGISTRY} from '../utils/wallets.js';

const props = defineProps({
  selectedWallet: {
    type: String,
    default: null
  },
  selectedProtocol: {
    type: String,
    required: true
  },
  availableProtocols: {
    type: Array,
    default: () => []
  },
  walletsRegistry: {
    type: Object,
    default: () => WALLETS_REGISTRY
  },
  protocolsRegistry: {
    type: Object,
    default: () => PROTOCOLS_REGISTRY
  }
});

const emit = defineEmits(['selectProtocol']);

const showDialog = ref(false);

const walletInfo = computed(() => {
  return props.walletsRegistry[props.selectedWallet];
});

const supportedProtocols = computed(() => {
  if(!props.selectedWallet) {
    return new Set();
  }
  const wallet = props.walletsRegistry[props.selectedWallet];
  if(!wallet || !wallet.supportedProtocols) {
    return new Set();
  }
  return new Set(Object.keys(wallet.supportedProtocols));
});

const isProtocolSupported = protocolId => {
  return supportedProtocols.value.has(protocolId);
};

const dialogActions = [
  {
    actionId: 'cancel',
    variant: 'flat',
    label: 'Cancel'
  }
];

const handleWalletSelect = walletId => {
  const wallet = props.walletsRegistry[walletId];
  if(wallet && wallet.supportedProtocols) {
    const supportedProtocols = Object.keys(wallet.supportedProtocols);
    const firstSupported = supportedProtocols.find(p =>
      props.availableProtocols.includes(p)) || props.availableProtocols[0];
    if(firstSupported) {
      emit('selectProtocol', {
        protocol: firstSupported,
        wallet: walletId
      });
    }
  }
  showDialog.value = false;
};

const handleProtocolSelect = protocolId => {
  emit('selectProtocol', {
    protocol: protocolId,
    wallet: null
  });
  showDialog.value = false;
};

const handleDialogAction = action => {
  if(action === 'cancel') {
    showDialog.value = false;
  }
};
</script>

<style scoped>
.wallet-selection {
  margin-bottom: 1rem;
}
</style>

