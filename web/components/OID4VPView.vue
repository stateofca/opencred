<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div
    class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
           md:px-16 lg:px-24 relative text-center">
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

    <!-- QR Code Display Section -->
    <div
      v-if="displayMode === 'qr'"
      class="mb-4 justify-center">
      <div
        class="relative-position mx-auto"
        :style="{
          maxWidth: '320px',
          minHeight: '320px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }">
        <img
          v-if="exchangeData.QR"
          :src="exchangeData.QR"
          class="mx-auto"
          :style="{ opacity: active ? 0.2 : 1 }">
        <q-spinner-tail
          v-if="active"
          class="no-pointer-events absolute-center text-primary"
          size="5em" />
      </div>
      <p class="text-gray-900 mt-4">
        {{$t('exchangeActiveExpiryMessage')}}
        <CountdownDisplay
          v-if="props.exchangeData?.createdAt && props.exchangeData?.ttl"
          :created-at="props.exchangeData.createdAt"
          :ttl="props.exchangeData.ttl" />
      </p>
      <button
        v-if="active"
        class="mx-auto max-w-prose text-sm underline text-gray-900 mt-2"
        @click="handleGoBack">
        {{$t('exchangeActiveGoBack')}}
      </button>
    </div>

    <!-- Same-Device Launch Section -->
    <div
      v-else
      class="flex flex-col items-center justify-center">
      <!-- DC API Button -->
      <div
        v-if="protocolType === 'dcapi'"
        class="my-8">
        <!-- Error State -->
        <div
          v-if="dcApiError"
          class="flex flex-col items-center">
          <p class="text-red-600 mb-4 text-center">
            <span class="font-bold">
              Error receiving credential from wallet.
            </span>
            <br>
            <span class="text-sm">{{dcApiError}}</span>
          </p>
          <div class="flex gap-4">
            <cadmv-button
              variant="primary"
              :loading="isButtonLoading"
              :disabled="isButtonLoading"
              @click="handleRetryDCApi">
              {{$t('dcApiRetry')}}
            </cadmv-button>
            <cadmv-button
              variant="secondary"
              :loading="isButtonLoading"
              :disabled="isButtonLoading"
              @click="handleFallbackToOID4VP">
              {{$t('dcApiFallback')}}
            </cadmv-button>
          </div>
        </div>
        <!-- Normal State -->
        <cadmv-button
          v-else
          variant="primary"
          :loading="active || isButtonLoading"
          :disabled="active || isButtonLoading"
          @click="handleSameDeviceClick('dcapi')">
          {{$t('appCta')}}
        </cadmv-button>
      </div>

      <!-- openid4vp:// Button -->
      <div
        v-else-if="protocolType === 'openid4vp'"
        class="my-8">
        <cadmv-button
          variant="primary"
          :loading="active || isButtonLoading"
          :disabled="active || isButtonLoading"
          @click="handleSameDeviceClick('openid4vp')">
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
        class="my-8">
        <cadmv-button
          variant="primary"
          :loading="active || isButtonLoading"
          :disabled="active || isButtonLoading"
          @click="handleSameDeviceClick('web')">
          {{$t('appCta')}}
        </cadmv-button>
      </div>

      <!-- Copy URL Button -->
      <div
        v-else-if="protocolType === 'copy'"
        class="flex flex-col items-center my-8">
        <cadmv-button
          variant="primary"
          :loading="active || isButtonLoading"
          :disabled="active || isButtonLoading"
          @click="handleSameDeviceClick('copy')">
          {{urlCopied ?
            ($t('urlCopied') || 'URL Copied!') :
            ($t('copyUrl') || 'Copy URL')}}
        </cadmv-button>
        <p
          v-if="urlCopied"
          class="mt-2 text-sm text-gray-600">
          {{$t('pasteUrlInWallet') || 'Paste this URL into your wallet app'}}
        </p>
      </div>

      <!-- Countdown Timer -->
      <div>
        <p class="my-4 text-gray-900">
          {{$t('exchangeActiveExpiryMessage')}}
          <CountdownDisplay
            v-if="props.exchangeData?.createdAt && props.exchangeData?.ttl"
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
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
import CountdownDisplay from './CountdownDisplay.vue';
import {httpClient} from '@digitalbazaar/http-client';
import {PROTOCOLS_REGISTRY} from '../utils/protocols.js';
import {startDCApiFlow as startDCApiFlowUtil} from '../utils/dcapi.js';
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
  },
  dcApiEnabled: {
    type: Boolean,
    default: false
  }
});
const emit = defineEmits(['selectProtocol', 'replaceExchange']);
const showVideo = ref(false);
const showNoSchemeHandlerWarning = ref(false);
const urlCopied = ref(false);
const dcApiAvailable = ref(false);
const isButtonLoading = ref(false);
const schemeHandlerTimeout = ref(null);
const dcApiError = ref(null);

// Get the protocol URL for the selected protocol
const protocolUrl = computed(() => {
  if(!props.exchangeData?.protocols) {
    return props.exchangeData?.OID4VP || '';
  }
  // Use the selected protocol URL from the protocols object
  return props.exchangeData.protocols[props.selectedProtocol] ||
    props.exchangeData.OID4VP || '';
});

// Determine display mode: QR or same-device
const displayMode = computed(() => {
  if(props.prefersQrDisplay && props.exchangeData?.QR) {
    return 'qr';
  }
  return 'same-device';
});

// Determine protocol type based on URL scheme and availability
const protocolType = computed(() => {
  // Check for DC API first - must be enabled at both system and workflow level
  if(dcApiAvailable.value && props.dcApiEnabled) {
    return 'dcapi';
  }

  // Check for copy URL protocol
  if(props.isCopyUrlProtocol) {
    return 'copy';
  }

  // Check URL scheme
  const url = protocolUrl.value;
  if(!url) {
    return null;
  }

  if(url.startsWith('openid4vp://')) {
    return 'openid4vp';
  }

  if(url.startsWith('http://') || url.startsWith('https://')) {
    return 'web';
  }

  return null;
});

const handleGoBack = () => {
  emit('selectProtocol', {
    protocol: props.selectedProtocol,
    displayQr: !props.prefersQrDisplay
  });
};

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
      // Fallback to legacy copy command for older browsers
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

// Check if DC API is available
const checkDCApiAvailability = () => {
  // Check if navigator.credentials.get exists and supports digital option
  if(navigator.credentials && navigator.credentials.get) {
    console.log('DC API is available');
    // DC API is available if navigator.credentials.get exists
    // The actual check happens when we try to use it
    dcApiAvailable.value = true;
  } else {
    dcApiAvailable.value = false;
  }
};

// Detect if scheme handler was invoked (for openid4vp://)
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

// Handle same-device button clicks based on protocol type
const handleSameDeviceClick = async (type, force = false) => {
  // If force is true, bypass loading check and reset loading state
  if(force) {
    isButtonLoading.value = false;
  } else if(props.active || isButtonLoading.value) {
    return;
  }

  isButtonLoading.value = true;

  try {
    switch(type) {
      case 'dcapi':
        if(!dcApiAvailable.value || !props.dcApiEnabled) {
          isButtonLoading.value = false;
          return;
        }
        // Clear any previous error
        dcApiError.value = null;
        try {
          console.log('Starting DC API flow');
          // Map selected protocol to profile parameter
          const profile = props.selectedProtocol || 'OID4VP-combined';
          await startDCApiFlowUtil({
            exchangeData: props.exchangeData,
            httpClient,
            profile,
            onExchangeUpdate: updatedExchange => {
              emit('replaceExchange', updatedExchange);
            }
          });
          // If successful, exchange will become active and watch will
          // reset loading. If not, reset here
          isButtonLoading.value = false;
        } catch(error) {
          console.error('DC API flow error:', error);
          // Display error to user without breaking the session
          dcApiError.value = error.message ||
            'An error occurred while starting the DC API flow.';
          isButtonLoading.value = false;
        }
        break;

      case 'openid4vp':
        // Open in new window and detect if handler was invoked
        window.open(protocolUrl.value, '_blank');
        detectSchemeHandler();
        // Don't reset loading state here - let exchange state handle it
        // The loading will persist until exchange becomes active or
        // timeout triggers
        break;

      case 'web':
        // Open web wallet or deep link in new window
        window.open(protocolUrl.value, '_blank');
        // Reset loading after opening (web links open immediately)
        isButtonLoading.value = false;
        break;

      case 'copy':
        await copyUrlToClipboard();
        // Reset loading immediately for copy since it's a fast operation
        isButtonLoading.value = false;
        break;

      default:
        console.warn('Unknown protocol type:', type);
        isButtonLoading.value = false;
    }
  } catch(error) {
    console.error('Error in handleSameDeviceClick:', error);
    isButtonLoading.value = false;
  }
};

// Handle retry of DC API
const handleRetryDCApi = () => {
  dcApiError.value = null;
  isButtonLoading.value = false;
  handleSameDeviceClick('dcapi', true);
};

// Handle fallback to OID4VP
const handleFallbackToOID4VP = () => {
  dcApiError.value = null;
  // Use the selected OID4VP protocol URL
  if(protocolUrl.value && !props.isCopyUrlProtocol) {
    window.open(protocolUrl.value, '_blank');
    detectSchemeHandler();
  }
};

// Watch for exchange becoming active to clear scheme handler timeout
watch(() => props.active, (newActive, oldActive) => {
  if(newActive && schemeHandlerTimeout.value) {
    clearTimeout(schemeHandlerTimeout.value);
  }
  schemeHandlerTimeout.value = null;
  // Reset button loading when exchange becomes active
  isButtonLoading.value = false;
  // Only clear DC API error when exchange successfully becomes active
  // (transitioning from inactive to active, not just when active changes)
  // This preserves error state during exchange updates that don't change
  // active state
  if(newActive && !oldActive) {
    dcApiError.value = null;
  }
});

// Watch for exchangeData changes to prevent error UI from disappearing
// on exchange updates that don't change active state
watch(() => props.exchangeData?.id, () => {
  // Don't clear error just because exchange data was updated
  // Error should only be cleared when exchange successfully becomes active
  // (handled in the props.active watch above)
});

onMounted(() => {
  checkDCApiAvailability();
});

onUnmounted(() => {
  // Clean up timeout on unmount
  if(schemeHandlerTimeout.value) {
    clearTimeout(schemeHandlerTimeout.value);
  }
});
</script>
