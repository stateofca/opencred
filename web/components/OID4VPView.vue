<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div
    class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
           px-16 lg:px-24 relative text-center">
    <h1
      class="text-3xl mb-12 text-center"
      :style="{color: brand.primary}">
      {{$t('qrTitle')}}
    </h1>
    <div class="mb-4 text-gray-900">
      <p
        v-if="$t('qrPageExplain')"
        class="text-gray-900"
        v-html="$t('qrPageExplain')" />
      <p
        v-if="$t('qrPageExplainHelp')"
        class="mt-2 text-gray-900"
        v-html="$t('qrPageExplainHelp')" />
    </div>
    <WalletSelection
      :selected-wallet="selectedWallet"
      :selected-protocol="selectedProtocol"
      :available-protocols="availableProtocols"
      :wallets-registry="walletsRegistry"
      :protocols-registry="protocolsRegistry"
      @select-protocol="handleSelectProtocol" />
    <div
      v-if="(active && !showDeeplink)"
      class="p-12 m-12 justify-center">
      <!-- Exchange is active: Loading spinner -->
      <div class="mx-auto w-7 mb-4">
        <q-spinner-tail
          color="primary"
          size="2em" />
      </div>
      <p class="text-gray-900">
        {{$t('exchangeActiveExpiryMessage')}}
        <CountdownDisplay
          v-if="props.exchangeData?.createdAt && props.exchangeData?.ttl"
          :created-at="props.exchangeData.createdAt"
          :ttl="props.exchangeData.ttl" />
      </p>
      <button
        class="mx-auto max-w-prose text-sm underline text-gray-900"
        @click="handleGoBack">
        {{$t('exchangeActiveGoBack')}}
      </button>
    </div>
    <div
      v-else-if="!showDeeplink && exchangeData.QR !== ''"
      class="mb-4 justify-center">
      <!-- Show QR code to scan from a wallet app -->
      <div>
        <img
          v-if="exchangeData.QR !== ''"
          :src="exchangeData.QR"
          class="mx-auto">
      </div>

      <p class="text-gray-900">
        {{$t('exchangeActiveExpiryMessage')}}
        <CountdownDisplay
          v-if="props.exchangeData?.createdAt && props.exchangeData?.ttl"
          :created-at="props.exchangeData.createdAt"
          :ttl="props.exchangeData.ttl" />
      </p>
    </div>
    <div
      v-else-if="exchangeData.QR"
      class="flex justify-center">
      <!-- A button to launch a same-device wallet or copy URL -->
      <div v-if="!active">
        <a
          v-if="protocolUrl && !isCopyUrlProtocol"
          :href="protocolUrl"
          class="text-white py-2 px-6 rounded-xl my-8 inline-block"
          :style="{ background: brand.cta || brand.primary }">
          {{$t('appCta')}}
        </a>
        <div
          v-else-if="protocolUrl && isCopyUrlProtocol"
          class="flex flex-col items-center my-8">
          <button
            class="text-white py-2 px-6 rounded-xl inline-block"
            :style="{ background: brand.cta || brand.primary }"
            @click="copyUrlToClipboard">
            {{urlCopied ?
              ($t('urlCopied') || 'URL Copied!') :
              ($t('copyUrl') || 'Copy URL')}}
          </button>
          <p
            v-if="urlCopied"
            class="mt-2 text-sm text-gray-600">
            {{$t('pasteUrlInWallet') || 'Paste this URL into your wallet app'}}
          </p>
        </div>
        <p
          v-if="showNoSchemeHandlerWarning"
          class="mt-4 text-red-600">
          <span class="text-bold">
            {{$t('noSchemeHandlerTitle')}}
          </span>
          {{$t('noSchemeHandlerMessage')}}
        </p>
      </div>
      <div v-else>
        <q-btn
          color="primary"
          class="px-16 py-4"
          disabled>
          <q-spinner-tail
            color="white"
            size="1em" />
        </q-btn>
      </div>
      <div>
        <p class="my-4 text-gray-900">
          {{$t('exchangeActiveExpiryMessage')}}
          <CountdownDisplay
            :created-at="props.exchangeData.createdAt"
            :ttl="props.exchangeData.ttl" />
        </p>
      </div>
    </div>
    <div class="mt-2">
      <button
        v-if="$t('qrExplainerText') !== ''
          && props.explainerVideo.id !== ''
          && props.explainerVideo.provider"
        :style="{color: brand.primary}"
        class="underline"
        @click="showVideo = true">
        {{$t('qrExplainerText')}}
      </button>
      <p
        v-if="$t('qrFooterHelp')"
        class="mt-2 text-gray-900"
        v-html="$t('qrFooterHelp')" />
    </div>
    <div
      v-if="$t('qrDisclaimer')"
      class="mt-12 flex flex-col items-center text-gray-900"
      v-html="$t('qrDisclaimer')" />

    <q-dialog
      v-model="showVideo">
      <q-card>
        <YouTubeVideo
          v-if="explainerVideo.provider === 'youtube'"
          :id="explainerVideo.id" />
        <q-card-actions
          align="right">
          <q-btn
            v-close-popup
            flat
            label="Close" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import {computed, ref} from 'vue';
import CountdownDisplay from './CountdownDisplay.vue';
import {PROTOCOLS_REGISTRY} from '../utils/protocols.js';
import {WALLETS_REGISTRY} from '../utils/wallets.js';
import WalletSelection from './WalletSelection.vue';

const props = defineProps({
  active: {
    type: Boolean,
    default: false
  },
  brand: {
    type: Object,
    default: () => ({
      primary: ''
    })
  },
  exchangeData: {
    type: Object,
    default: () => ({
      QR: '',
      vcapi: '',
      OID4VP: '',
      ttl: 900,
      createdAt: new Date(),
      oidc: {
        state: ''
      }
    })
  },
  explainerVideo: {
    type: Object,
    default: () => ({
      id: '',
      provider: ''
    })
  },
  selectedProtocol: {
    type: String,
    default: 'OID4VP-combined'
  },
  selectedWallet: {
    type: String,
    default: 'cadmv-wallet'
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
  },
  prefersQrDisplay: {
    type: Boolean,
    default: true
  },
  isCopyUrlProtocol: {
    type: Boolean,
    default: false
  }
});
const emit = defineEmits(['selectProtocol']);
const showVideo = ref(false);
const showNoSchemeHandlerWarning = ref(false);
const urlCopied = ref(false);

const showDeeplink = computed(() => !props.prefersQrDisplay);

const handleGoBack = () => {
  emit('selectProtocol', {
    protocol: props.selectedProtocol,
    displayQr: !props.prefersQrDisplay
  });
};

// Get the protocol URL for the selected protocol
const protocolUrl = computed(() => {
  if(!props.exchangeData?.protocols) {
    return props.exchangeData?.OID4VP || '';
  }
  // Use the selected protocol URL from the protocols object
  return props.exchangeData.protocols[props.selectedProtocol] ||
    props.exchangeData.OID4VP || '';
});

const handleSelectProtocol = event => {
  emit('selectProtocol', event);
};

const copyUrlToClipboard = async () => {
  if(protocolUrl.value) {
    try {
      await navigator.clipboard.writeText(protocolUrl.value);
      urlCopied.value = true;
      setTimeout(() => {
        urlCopied.value = false;
      }, 3000);
    } catch(err) {
      console.error('Failed to copy URL:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = protocolUrl.value;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        urlCopied.value = true;
        setTimeout(() => {
          urlCopied.value = false;
        }, 3000);
      } catch(fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  }
};
</script>
