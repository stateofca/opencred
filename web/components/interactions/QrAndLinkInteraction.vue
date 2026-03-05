<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="mb-4 justify-center text-center">
    <div
      v-if="(isMobile && showQrCode) || !isMobile"
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
        v-if="localQrCodeDataUri && !isGeneratingQr &&
          ((isMobile && showQrCode) || !isMobile)"
        :src="localQrCodeDataUri"
        class="mx-auto"
        :style="{ opacity: active ? 0.2 : 1 }">
      <q-spinner-tail
        v-if="active || isGeneratingQr"
        class="no-pointer-events absolute-center text-primary"
        size="5em" />
    </div>
    <div
      v-if="compatibleWallets.length > 0"
      class="flex flex-col gap-3 w-full max-w-md mx-auto my-6">
      <a
        v-if="selectedWalletForLaunch"
        :href="getWalletDeepLinkUrl(selectedWalletForLaunch.walletId,
                                    selectedWalletForLaunch.protocolId)"
        target="_blank"
        rel="noopener noreferrer"
        :class="[
          (active && !isReset) || loadingWalletId !== null ?
            'opacity-50 cursor-not-allowed pointer-events-none' :
            'cursor-pointer'
        ]"
        @click.prevent="handleLaunchClick">
        <cadmv-button
          variant="primary"
          :loading="isLaunchLoading"
          :disabled="(active && !isReset) || loadingWalletId !== null"
          class="w-full justify-start">
          <div
            class="flex items-center gap-3 flex-grow min-w-0
           overflow-hidden">
            <q-icon
              name="account_balance_wallet"
              size="32px"
              class="flex-shrink-0 text-gray-600" />
            <span class="font-medium text-left truncate min-w-0">
              {{$t('launchWalletApp')}}
            </span>
          </div>
        </cadmv-button>
      </a>
      <p
        v-if="showNoSchemeHandlerWarning"
        class="mt-4 text-red-600 text-center">
        <span class="font-bold">{{$t('noSchemeHandlerTitle')}}</span>
        {{$t('noSchemeHandlerMessage')}}
      </p>
      <p
        v-if="walletNames"
        class="text-sm text-gray-500 mt-1 mb-0">
        {{$t('worksWithWallets', {names: walletNames})}}
      </p>
      <button
        v-if="isMobile && !showQrCode && localQrCodeDataUri &&
          !isGeneratingQr"
        type="button"
        class="flex items-center justify-center gap-2 px-4 py-2 rounded-md
               border-2 border-primary bg-primary/10 hover:bg-primary/20
               transition-all text-primary font-medium"
        @click="handleToggleQrCode">
        <q-icon
          name="qr_code_scanner"
          size="24px" />
        <span>{{$t('interactionMethod_qr')}}</span>
      </button>
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
      v-if="$t('qrDisclaimer')"
      class="mt-12 flex flex-col items-center text-gray-900"
      v-html="$t('qrDisclaimer')" />
  </div>
</template>

<script setup>
import {computed, onUnmounted, ref, watch} from 'vue';
import {copyToClipboard, useQuasar} from 'quasar';
import {
  extractCredentialFormats,
  getProtocolInteractionMethods
} from '../../../common/wallets/index.js';
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
import CountdownDisplay from '../CountdownDisplay.vue';
import QRCode from 'qrcode';
import {QSpinnerTail} from 'quasar';
import {useI18n} from 'vue-i18n';

const props = defineProps({
  exchangeData: {
    type: Object,
    default: () => ({createdAt: null, ttl: null})
  },
  active: {
    type: Boolean,
    default: false
  },
  deepLinkUrl: {
    type: String,
    default: ''
  },
  protocolType: {
    type: String,
    default: 'openid4vp'
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

const emit = defineEmits(['launch', 'goBack', 'switchInteractionMethod']);

const {t} = useI18n({useScope: 'global'});
const $q = useQuasar();
const isMobile = computed(() =>
  ($q.platform?.is?.ios ?? false) || ($q.platform?.is?.android ?? false)
);

const localQrCodeDataUri = ref('');
const isGeneratingQr = ref(false);
const loadingWalletId = ref(null);
const isReset = ref(false);
const showQrCode = ref(!isMobile.value);
const showNoSchemeHandlerWarning = ref(false);
const schemeHandlerTimeout = ref(null);

const selectedWalletForLaunch = computed(() => {
  const wallets = props.compatibleWallets;
  if(wallets.length === 0) {
    return null;
  }
  if($q.platform?.is?.ios) {
    const apple = wallets.find(w => w.walletId === 'apple-wallet');
    if(apple) {
      return apple;
    }
  }
  if($q.platform?.is?.android) {
    const google = wallets.find(w => w.walletId === 'google-wallet');
    if(google) {
      return google;
    }
  }
  return wallets[0];
});

const walletNames = computed(() => {
  if(!props.compatibleWallets.length || !props.walletsRegistry) {
    return '';
  }
  return props.compatibleWallets.map(({walletId}) => {
    const wallet = props.walletsRegistry[walletId];
    return wallet?.nameKey ? t(wallet.nameKey) : (wallet?.name || walletId);
  }).filter(Boolean).join(', ');
});

const isLaunchLoading = computed(() => loadingWalletId.value !== null);

const getWalletQrUrl = async (walletId, protocolId) => {
  if(!walletId || !protocolId || !props.workflow) {
    return props.exchangeData?.protocols?.[protocolId] ||
      props.exchangeData?.OID4VP || '';
  }
  const formats = extractCredentialFormats(props.workflow);
  if(formats.length === 0) {
    return props.exchangeData?.protocols?.[protocolId] ||
      props.exchangeData?.OID4VP || '';
  }
  for(const format of formats) {
    const combinations = getProtocolInteractionMethods({
      walletId,
      format,
      exchange: props.exchangeData,
      registry: props.walletsRegistry
    });
    const matching = combinations.find(c =>
      c.protocolId === protocolId &&
      (c.interactionMethod === 'qr' || c.interactionMethod === 'link')
    );
    if(matching?.request) {
      return typeof matching.request === 'string' ?
        matching.request : matching.request;
    }
  }
  return props.exchangeData?.protocols?.[protocolId] ||
    props.exchangeData?.OID4VP || '';
};

const generateQrCode = async (walletId, protocolId) => {
  isGeneratingQr.value = true;
  try {
    const url = await getWalletQrUrl(walletId, protocolId);
    if(url) {
      localQrCodeDataUri.value = await QRCode.toDataURL(url);
    } else {
      localQrCodeDataUri.value = props.exchangeData?.QR || '';
    }
  } catch {
    localQrCodeDataUri.value = props.exchangeData?.QR || '';
  } finally {
    isGeneratingQr.value = false;
  }
};

watch(() => selectedWalletForLaunch.value, async selected => {
  if(selected?.walletId && selected?.protocolId) {
    await generateQrCode(selected.walletId, selected.protocolId);
  } else {
    localQrCodeDataUri.value = props.exchangeData?.QR || '';
  }
}, {immediate: true});

watch(() => props.exchangeData?.QR, newQr => {
  if(!isGeneratingQr.value && !selectedWalletForLaunch.value) {
    localQrCodeDataUri.value = newQr || '';
  }
}, {immediate: true});

const getWalletDeepLinkUrl = (walletId, protocolId) => {
  if(!walletId || !protocolId || !props.workflow) {
    return props.deepLinkUrl;
  }
  const formats = extractCredentialFormats(props.workflow);
  if(formats.length === 0) {
    return props.deepLinkUrl;
  }
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
    if(matching?.request) {
      return typeof matching.request === 'string' ?
        matching.request : matching.request;
    }
  }
  return props.deepLinkUrl;
};

const getProtocolTypeForUrl = (url, protocolId) => {
  if(!url) {
    return null;
  }
  if(url.startsWith('openid4vp://')) {
    return 'openid4vp';
  }
  if(url.startsWith('http://') || url.startsWith('https://')) {
    const walletDeepLinkDomains = ['lcw.app'];
    if(walletDeepLinkDomains.some(d => url.includes(d))) {
      return 'web';
    }
    if(['interact', 'vcapi'].includes(protocolId)) {
      return 'copy';
    }
    return 'web';
  }
  return null;
};

const detectSchemeHandler = () => {
  // Clear any existing timeout
  if(schemeHandlerTimeout.value) {
    clearTimeout(schemeHandlerTimeout.value);
    schemeHandlerTimeout.value = null;
  }

  // Set timeout to check if we're still on the page after 1.5s
  schemeHandlerTimeout.value = setTimeout(() => {
    // If we're still here after 1.5s, the scheme handler likely didn't work
    showNoSchemeHandlerWarning.value = true;
    // Restore button to clickable state
    loadingWalletId.value = null;
    // Show the warning for 5s, then clear it
    schemeHandlerTimeout.value = setTimeout(() => {
      showNoSchemeHandlerWarning.value = false;
      schemeHandlerTimeout.value = null;
    }, 5000);
  }, 1500);
};

const handleLaunchClick = () => {
  const selected = selectedWalletForLaunch.value;
  if(!selected || (props.active && !isReset.value) || loadingWalletId.value) {
    return;
  }
  loadingWalletId.value = selected.walletId;
  isReset.value = false;
  showNoSchemeHandlerWarning.value = false;
  const walletUrl = getWalletDeepLinkUrl(
    selected.walletId, selected.protocolId);
  const protocolTypeValue = getProtocolTypeForUrl(
    walletUrl, selected.protocolId) ||
    props.protocolType;
  if(protocolTypeValue === 'copy') {
    copyToClipboard(walletUrl);
    // For copy, clear loading state immediately since there's no scheme handler
    setTimeout(() => {
      loadingWalletId.value = null;
    }, 100);
  } else {
    window.open(walletUrl, '_blank');
    // Only detect scheme handler for openid4vp and web protocols
    detectSchemeHandler();
  }
  emit('launch',
    {walletId: selected.walletId, protocolId: selected.protocolId});
};

const handleGoBack = () => {
  emit('goBack');
};

const handleToggleQrCode = () => {
  showQrCode.value = true;
};

onUnmounted(() => {
  // Clean up timeout on unmount
  if(schemeHandlerTimeout.value) {
    clearTimeout(schemeHandlerTimeout.value);
    schemeHandlerTimeout.value = null;
  }
  // Clean up loading state on unmount
  loadingWalletId.value = null;
  isReset.value = false;
  showNoSchemeHandlerWarning.value = false;
});
</script>
