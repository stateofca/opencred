<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="flex flex-col items-center justify-center">
    <!-- Wallet Launch Buttons (if wallets provided) -->
    <div
      v-if="compatibleWallets.length > 0"
      class="flex flex-col gap-3 w-full max-w-md mx-auto my-8">
      <div
        v-for="{walletId, protocolId, supportsLink, supportsCopy}
          in compatibleWallets"
        :key="walletId"
        class="w-full flex flex-col">
        <!-- Launch only (e.g. CA DMV) -->
        <WalletLaunchButton
          v-if="supportsLink && !supportsCopy"
          :wallet="walletsRegistry?.[walletId]"
          :wallet-id="walletId"
          :protocol-id="protocolId"
          :loading="loadingWalletId === walletId"
          :disabled="(active && !isReset) || loadingWalletId !== null"
          @launch="handleLaunch" />
        <!-- Launch + Copy lockup (e.g. LCW) -->
        <div
          v-else-if="supportsLink && supportsCopy"
          class="flex flex-row w-full gap-0 min-w-0">
          <WalletLaunchButton
            :wallet="walletsRegistry?.[walletId]"
            :wallet-id="walletId"
            :protocol-id="protocolId"
            :loading="loadingWalletId === walletId"
            :disabled="(active && !isReset) || loadingWalletId !== null"
            no-full-width
            class="flex-grow min-w-0 overflow-hidden"
            @launch="handleLaunch" />
          <cadmv-button
            variant="secondary"
            flat
            :disabled="(active && !isReset) || loadingWalletId !== null"
            class="flex-shrink-0 w-11 min-w-[44px]"
            @click="handleCopy(walletId, protocolId)">
            <q-icon
              name="content_copy"
              size="24px" />
          </cadmv-button>
        </div>
        <!-- Copy only (e.g. VCALM) -->
        <WalletLaunchButton
          v-else-if="supportsCopy && !supportsLink"
          :wallet="walletsRegistry?.[walletId]"
          :wallet-id="walletId"
          :protocol-id="protocolId"
          copy-only
          :loading="loadingWalletId === walletId"
          :disabled="(active && !isReset) || loadingWalletId !== null"
          @copy="handleCopy" />
        <!-- Copy feedback (for LCW lockup or VCALM copy-only) -->
        <p
          v-if="urlCopiedByWallet[walletId]"
          class="mt-2 text-sm text-gray-600">
          {{$t('linkCopiedToClipboard')}}
        </p>
      </div>
      <p
        v-if="showNoSchemeHandlerWarning"
        class="mt-4 text-red-600 text-center">
        <span class="text-bold">
          {{$t('noSchemeHandlerTitle')}}
        </span>
        {{$t('noSchemeHandlerMessage')}}
      </p>
    </div>

    <!-- Fallback: Single Button (if no wallets provided) -->
    <div
      v-else
      class="flex flex-col items-center my-8">
      <!-- openid4vp:// Button -->
      <div
        v-if="protocolType === 'openid4vp'"
        class="flex flex-col items-center">
        <cadmv-button
          variant="primary"
          :loading="loadingWalletId === protocolType"
          :disabled="(active && !isReset) || loadingWalletId !== null"
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
        class="flex flex-col items-center">
        <cadmv-button
          variant="primary"
          :loading="loadingWalletId === protocolType"
          :disabled="(active && !isReset) || loadingWalletId !== null"
          @click="handleActivate">
          {{$t('appCta')}}
        </cadmv-button>
      </div>

      <!-- Copy URL Button -->
      <div
        v-else-if="protocolType === 'copy'"
        class="flex flex-col items-center">
        <cadmv-button
          variant="primary"
          :loading="loadingWalletId === protocolType"
          :disabled="(active && !isReset) || loadingWalletId !== null"
          @click="handleActivate">
          {{urlCopied ? $t('urlCopied') : $t('copyUrl')}}
        </cadmv-button>
        <p
          v-if="urlCopied"
          class="mt-2 text-sm text-gray-600">
          {{$t('pasteUrlInWallet')}}
        </p>
      </div>
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

    <!-- Toggle to QR Code and Reset -->
    <div
      v-if="!exchangeData?.state || exchangeData?.state !== 'complete'"
      class="mt-2 flex gap-2 items-center justify-center">
      <cadmv-button
        no-caps
        variant="flat"
        label="Scan QR code"
        @click="handleToggleQr" />
      <cadmv-button
        v-if="loadingWalletId !== null"
        no-caps
        variant="secondary"
        label="Reset"
        @click="handleReset" />
    </div>
  </div>
</template>

<script setup>
import {
  extractCredentialFormats,
  getProtocolInteractionMethods
} from '../../../common/wallets/index.js';
import {onUnmounted, reactive, ref, watch} from 'vue';
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
import {copyToClipboard} from 'quasar';
import CountdownDisplay from '../CountdownDisplay.vue';
import WalletLaunchButton from '../WalletLaunchButton.vue';

const props = defineProps({
  deepLinkUrl: {
    type: String,
    required: true
  },
  exchangeData: {
    type: Object,
    default: () => ({
      createdAt: null,
      ttl: null
    })
  },
  protocolType: {
    type: String,
    required: true
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

const emit = defineEmits(['activate', 'toggleQr', 'launch']);

const showNoSchemeHandlerWarning = ref(false);
const urlCopied = ref(false);
const urlCopiedByWallet = reactive({});
const schemeHandlerTimeout = ref(null);
const loadingWalletId = ref(null);
const isReset = ref(false);

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

const handleReset = () => {
  loadingWalletId.value = null;
  isReset.value = true;
};

const handleToggleQr = () => {
  if(schemeHandlerTimeout.value) {
    clearTimeout(schemeHandlerTimeout.value);
    schemeHandlerTimeout.value = null;
  }
  showNoSchemeHandlerWarning.value = false;
  loadingWalletId.value = null;
  isReset.value = false;
  emit('toggleQr');
};

// Get wallet-specific deep link URL (from link or copy combination)
const getWalletDeepLinkUrl = (walletId, protocolId) => {
  if(!walletId || !protocolId || !props.workflow) {
    return props.deepLinkUrl;
  }

  // Extract credential formats from workflow
  const formats = extractCredentialFormats(props.workflow);
  if(formats.length === 0) {
    return props.deepLinkUrl;
  }

  // Try to get wallet-specific URL (link or copy)
  for(const format of formats) {
    const combinations = getProtocolInteractionMethods({
      walletId,
      format,
      exchange: props.exchangeData,
      registry: props.walletsRegistry
    });

    const matching = combinations.find(c =>
      c.protocolId === protocolId &&
      (c.interactionMethod === 'link' || c.interactionMethod === 'copy')
    );

    if(matching && matching.request) {
      return typeof matching.request === 'string' ? matching.request :
        matching.request;
    }
  }

  // Fallback to default deep link URL
  return props.deepLinkUrl;
};

// Determine protocol type for a URL: 'web' or 'copy'
const getProtocolTypeForUrl = (url, protocolId) => {
  if(!url) {
    return null;
  }

  if(url.startsWith('openid4vp://')) {
    return 'openid4vp';
  }

  if(url.startsWith('http://') || url.startsWith('https://')) {
    // Check if this is a wallet-specific deep link URL
    // Wallet deep links should open in new tab, not be copied
    const walletDeepLinkDomains = ['lcw.app'];
    const isWalletDeepLink = walletDeepLinkDomains.some(domain =>
      url.includes(domain));

    if(isWalletDeepLink) {
      return 'web';
    }

    // Check if wallet has a custom URL generator for this protocol
    // Protocol endpoint URLs should be copied
    const copyProtocols = ['interact', 'vcapi'];
    if(copyProtocols.includes(protocolId)) {
      return 'copy';
    }
    return 'web';
  }

  return null;
};

const copyUrlToClipboardWithUrl = async url => {
  if(!url) {
    return;
  }
  try {
    await copyToClipboard(url);
    urlCopied.value = true;
    setTimeout(() => {
      urlCopied.value = false;
    }, 3000);
  } catch(err) {
    console.error('Failed to copy URL:', err);
  }
};

const handleCopy = async (walletIdOrPayload, protocolId) => {
  const {walletId, protocolId: pid} = typeof walletIdOrPayload === 'object' ?
    walletIdOrPayload : {walletId: walletIdOrPayload, protocolId};
  const url = getWalletDeepLinkUrl(walletId, pid);
  if(!url) {
    return;
  }
  try {
    await copyToClipboard(url);
    urlCopiedByWallet[walletId] = true;
    setTimeout(() => {
      urlCopiedByWallet[walletId] = false;
    }, 3000);
  } catch(err) {
    console.error('Failed to copy URL:', err);
  }
};

const handleLaunch = ({walletId, protocolId}) => {
  // Set loading state for this wallet button
  loadingWalletId.value = walletId;
  isReset.value = false;

  const walletUrl = getWalletDeepLinkUrl(walletId, protocolId);
  const protocolTypeValue = getProtocolTypeForUrl(walletUrl, protocolId) ||
    props.protocolType;

  // Handle activation based on protocol type
  if(protocolTypeValue === 'copy') {
    copyUrlToClipboardWithUrl(walletUrl);
  } else if(protocolTypeValue === 'openid4vp') {
    window.open(walletUrl, '_blank');
    detectSchemeHandler();
  } else if(protocolTypeValue === 'web') {
    window.open(walletUrl, '_blank');
  }

  emit('launch', {walletId, protocolId});
  emit('activate');
};

const handleActivate = async () => {
  // Set loading state for this fallback button
  loadingWalletId.value = props.protocolType;
  isReset.value = false;

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
watch(() => props.active, isActive => {
  if(isActive && schemeHandlerTimeout.value) {
    clearTimeout(schemeHandlerTimeout.value);
    schemeHandlerTimeout.value = null;
  }
});

onUnmounted(() => {
  // Clean up timeout on unmount
  if(schemeHandlerTimeout.value) {
    clearTimeout(schemeHandlerTimeout.value);
  }
  // Clean up loading state on unmount
  loadingWalletId.value = null;
  isReset.value = false;
});
</script>

