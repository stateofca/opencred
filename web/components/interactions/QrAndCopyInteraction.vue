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
      <cadmv-button
        v-if="selectedWalletForLaunch"
        variant="primary"
        :disabled="(active && !isReset) || loadingWalletId !== null"
        class="w-full justify-start"
        @click="handleCopyClick">
        <div class="flex items-center gap-3 flex-grow min-w-0 overflow-hidden">
          <q-icon
            name="content_copy"
            size="32px"
            class="flex-shrink-0 text-gray-600" />
          <span class="font-medium text-left truncate min-w-0">
            {{$t('copyUrl')}}
          </span>
        </div>
      </cadmv-button>
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

const getWalletUrl = async (walletId, protocolId) => {
  if(!walletId || !protocolId || !props.workflow) {
    return props.exchangeData?.protocols?.interact || '';
  }
  const formats = extractCredentialFormats(props.workflow);
  for(const format of formats) {
    const combinations = getProtocolInteractionMethods({
      walletId,
      format,
      exchange: props.exchangeData,
      registry: props.walletsRegistry
    });
    const matching = combinations.find(c =>
      c.protocolId === protocolId &&
      (c.interactionMethod === 'qr' || c.interactionMethod === 'copy')
    );
    if(matching?.request) {
      return typeof matching.request === 'string' ?
        matching.request : matching.request;
    }
  }
  return props.exchangeData?.protocols?.interact || '';
};

const generateQrCode = async (walletId, protocolId) => {
  isGeneratingQr.value = true;
  try {
    const url = await getWalletUrl(walletId, protocolId);
    if(url) {
      localQrCodeDataUri.value = await QRCode.toDataURL(url);
    } else {
      localQrCodeDataUri.value = '';
    }
  } catch {
    localQrCodeDataUri.value = '';
  } finally {
    isGeneratingQr.value = false;
  }
};

watch(() => selectedWalletForLaunch.value, async selected => {
  if(selected?.walletId && selected?.protocolId) {
    await generateQrCode(selected.walletId, selected.protocolId);
  } else {
    localQrCodeDataUri.value = '';
  }
}, {immediate: true});

const handleCopyClick = async () => {
  const selected = selectedWalletForLaunch.value;
  if(!selected || (props.active && !isReset.value) || loadingWalletId.value) {
    return;
  }
  loadingWalletId.value = selected.walletId;
  isReset.value = false;
  try {
    const url = await getWalletUrl(selected.walletId, selected.protocolId);
    if(url) {
      await copyToClipboard(url);
    }
    emit('launch', {
      walletId: selected.walletId,
      protocolId: selected.protocolId
    });
  } finally {
    loadingWalletId.value = null;
  }
};

const handleGoBack = () => {
  emit('goBack');
};

const handleToggleQrCode = () => {
  showQrCode.value = true;
};

onUnmounted(() => {
  loadingWalletId.value = null;
  isReset.value = false;
});
</script>
