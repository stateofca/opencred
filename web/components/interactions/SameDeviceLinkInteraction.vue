<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="flex flex-col items-center justify-center">
    <!-- openid4vp:// Button -->
    <div
      v-if="protocolType === 'openid4vp'"
      class="flex flex-col items-center my-8">
      <cadmv-button
        variant="primary"
        :loading="active"
        :disabled="active"
        @click="handleActivate">
        {{$t('appCta')}}
      </cadmv-button>
      <p
        v-if="showNoSchemeHandlerWarning"
        class="mt-4 text-red-600">
        <span class="text-bold">
          {{$t('noSchemeHandlerTitle')}}
        </span>
        {{$t('noSchemeHandlerMessage')}}
      </p>
    </div>

    <!-- Web/Deep Link Button -->
    <div
      v-else-if="protocolType === 'web'"
      class="flex flex-col items-center my-8">
      <cadmv-button
        variant="primary"
        :loading="active"
        :disabled="active"
        @click="handleActivate">
        {{$t('appCta')}}
      </cadmv-button>
    </div>

    <!-- Copy URL Button -->
    <div
      v-else-if="protocolType === 'copy'"
      class="flex flex-col items-center my-8">
      <cadmv-button
        variant="primary"
        :loading="active"
        :disabled="active"
        @click="handleActivate">
        {{urlCopied ? $t('urlCopied') : $t('copyUrl')}}
      </cadmv-button>
      <p
        v-if="urlCopied"
        class="mt-2 text-sm text-gray-600">
        {{$t('pasteUrlInWallet')}}
      </p>
    </div>

    <!-- Countdown Timer -->
    <div>
      <p class="my-4 text-gray-900">
        {{$t('exchangeActiveExpiryMessage')}}
        <CountdownDisplay
          v-if="exchangeData?.createdAt && exchangeData?.ttl"
          :created-at="exchangeData.createdAt"
          :ttl="exchangeData.ttl" />
      </p>
    </div>

    <!-- Toggle to QR Code -->
    <div
      v-if="exchangeState === 'pending' || exchangeState === 'active'"
      class="mt-2">
      <cadmv-button
        no-caps
        variant="flat"
        label="Scan QR code"
        @click="handleToggleQr" />
    </div>
  </div>
</template>

<script setup>
import {onUnmounted, ref, watch} from 'vue';
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
import {copyToClipboard} from 'quasar';
import CountdownDisplay from '../CountdownDisplay.vue';

const props = defineProps({
  deepLinkUrl: {
    type: String,
    required: true
  },
  exchangeState: {
    type: String,
    default: 'pending'
  },
  exchangeData: {
    type: Object,
    default: () => ({
      createdAt: null,
      ttl: null
    })
  },
  sameDeviceState: {
    type: Object,
    default: () => ({})
  },
  protocolType: {
    type: String,
    required: true
  },
  active: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['activate', 'toggleQr']);

const showNoSchemeHandlerWarning = ref(false);
const urlCopied = ref(false);
const schemeHandlerTimeout = ref(null);

const copyUrlToClipboard = async () => {
  if(!props.deepLinkUrl) {
    return;
  }
  try {
    await copyToClipboard(props.deepLinkUrl);
    urlCopied.value = true;
    setTimeout(() => {
      urlCopied.value = false;
    }, 3000);
  } catch(err) {
    console.error('Failed to copy URL:', err);
  }
};

const detectSchemeHandler = () => {
  // Clear any existing timeout
  if(schemeHandlerTimeout.value) {
    clearTimeout(schemeHandlerTimeout.value);
  }

  // Set timeout to check if we're still on the page after 1.5s
  schemeHandlerTimeout.value = setTimeout(() => {
    // If we're still here after 1.5s, the scheme handler likely didn't work
    showNoSchemeHandlerWarning.value = true;
  }, 1500);
};

const handleToggleQr = () => {
  if(schemeHandlerTimeout.value) {
    clearTimeout(schemeHandlerTimeout.value);
    schemeHandlerTimeout.value = null;
  }
  showNoSchemeHandlerWarning.value = false;
  emit('toggleQr');
};

const handleActivate = async () => {
  if(props.protocolType === 'copy') {
    await copyUrlToClipboard();
  } else if(props.protocolType === 'openid4vp') {
    window.open(props.deepLinkUrl, '_blank');
    detectSchemeHandler();
  } else if(props.protocolType === 'web') {
    window.open(props.deepLinkUrl, '_blank');
  }
  emit('activate');
};

// Watch for exchange becoming active to clear scheme handler timeout
watch(() => props.exchangeState, newState => {
  if(newState === 'active' && schemeHandlerTimeout.value) {
    clearTimeout(schemeHandlerTimeout.value);
    schemeHandlerTimeout.value = null;
  }
});

onUnmounted(() => {
  // Clean up timeout on unmount
  if(schemeHandlerTimeout.value) {
    clearTimeout(schemeHandlerTimeout.value);
  }
});
</script>

