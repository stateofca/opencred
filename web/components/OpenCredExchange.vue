<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div>
    <WalletInteraction
      :exchange-data="context.exchangeData || {}"
      :exchange-state="context.exchangeData?.state || 'pending'"
      :error="state.error"
      :selected-protocol="selectedProtocol"
      :selected-wallet="selectedWallet"
      :available-protocols="availableProtocols"
      :brand="context.rp.brand"
      :options="context.options"
      :explainer-video="context.rp.brand.explainerVideo"
      :active="state.active && !state.activeOverride"
      :rp="context.rp"
      :wallets-registry="walletsRegistry"
      :protocols-registry="protocolsRegistry"
      :prefers-qr-display="prefersQrDisplay"
      @select-protocol="handleSelectProtocol"
      @reset="handleResetExchange" />
    <CadmvDialog
      v-if="context.exchangeData?.state !== 'complete' &&
        state.statusCheckCount > 10"
      :actions="statusDialogActions"
      @action="handleStatusDialogAction">
      <template #body>
        <p class="text-sm text-center">
          <span class="text-bold">Are you still there? </span>
          Status checking is paused.
        </p>
      </template>
    </CadmvDialog>
  </div>
</template>

<script setup>
import {computed, inject, onBeforeMount, onMounted, onUnmounted, reactive,
  ref, watch} from 'vue';
import {CadmvDialog} from '@digitalbazaar/cadmv-ui';
import {httpClient} from '@digitalbazaar/http-client';
import {PROTOCOLS_REGISTRY} from '../utils/protocols.js';
import QRCode from 'qrcode';
import {useI18n} from 'vue-i18n';
import {useQuasar} from 'quasar';
import WalletInteraction from './WalletInteraction.vue';
import {WALLETS_REGISTRY} from '../utils/wallets.js';

const $cookies = inject('$cookies');
const $q = useQuasar();

// Get context from parent component (LoginView or VerificationView)
// Context must be provided by parent - this component does not fetch it
const parentContext = inject('exchangeContext', null);
if(!parentContext) {
  throw new Error(
    'OpenCredExchange requires exchangeContext to be provided by parent ' +
    'component'
  );
}
const context = parentContext;

const state = reactive({
  active: false,
  error: null,
  intervalId: null,
  statusCheckCount: 0
});

const selectedProtocol = ref('OID4VP-draft18');
const selectedWallet = ref(null);
const prefersQrDisplay = ref(true);

const walletsRegistry = WALLETS_REGISTRY;
const protocolsRegistry = PROTOCOLS_REGISTRY;

const statusDialogActions = [
  {
    actionId: 'resume',
    variant: 'primary',
    label: 'Resume checking'
  },
  {
    actionId: 'reset',
    variant: 'flat',
    label: 'Reset Session'
  }
];

const availableProtocols = computed(() => {
  // If exchangeData has protocols, use those keys
  if(context.value?.exchangeData?.protocols) {
    return Object.keys(context.value.exchangeData.protocols);
  }
  // Fallback to options.exchangeProtocols
  if(!context.value?.options?.exchangeProtocols) {
    return [];
  }
  // Map 'openid4vp' to the default OID4VP protocol
  return context.value.options.exchangeProtocols.map(p => {
    if(p === 'openid4vp') {
      return context.value.options.OID4VPdefault || 'OID4VP-combined';
    }
    return p;
  });
});

/**
 * Set state.error to the given error object, with defaults applied.
 * @param {Object} error
 * @param {string?} error.title
 * @param {string?} error.message
 * @param {boolean?} error.resettable
 */
const handleError = error => {
  state.intervalId = clearInterval(state.intervalId);
  state.error = {
    title: error?.title || 'Error',
    subtitle: error?.subtitle || 'The following error was encountered:',
    message: error?.message || 'An unexpected error occurred.',
    resettable: !!error?.resettable || false
  };
  state.active = false;
  state.activeOverride = false;
  state.statusCheckCount = 0;
  $cookies.remove('accessToken');
  $cookies.remove('exchangeId');
};

const {t: translate} = useI18n({useScope: 'global'});

const handleSelectProtocol = ({protocol, wallet, displayQr}) => {
  if(protocol) {
    selectedProtocol.value = protocol;
    // Set cookie for protocol
    if($cookies) {
      $cookies.set('selectedProtocol', protocol, {expires: '1Y'});
    }
    // Reset status check count when protocol changes
    state.statusCheckCount = 0;
  }
  // wallet can be null when protocol is selected directly
  if(wallet !== undefined) {
    selectedWallet.value = wallet;
    // Set cookie for wallet (or remove if null)
    if($cookies) {
      if(wallet) {
        $cookies.set('selectedWallet', wallet, {expires: '1Y'});
      } else {
        $cookies.remove('selectedWallet');
      }
    }
  }
  if(displayQr !== undefined) {
    prefersQrDisplay.value = displayQr;
  }
};

// Track if we've loaded from cookies to avoid reloading
const cookiesLoaded = ref(false);

// Load from cookies when exchange data becomes available
watch(() => context.value?.exchangeData, () => {
  if(cookiesLoaded.value || !$cookies || !context.value?.exchangeData) {
    return;
  }

  const cookieProtocol = $cookies.get('selectedProtocol');
  const cookieWallet = $cookies.get('selectedWallet');

  // Only use cookie values if they're supported by the exchange
  if(cookieProtocol && availableProtocols.value.includes(cookieProtocol)) {
    selectedProtocol.value = cookieProtocol;
  }
  if(cookieWallet !== undefined) {
    // Check if wallet supports the selected protocol or if protocol-only mode
    if(cookieWallet === null ||
      (walletsRegistry[cookieWallet]?.supportedProtocols?.[
        selectedProtocol.value])) {
      selectedWallet.value = cookieWallet;
    }
  }

  cookiesLoaded.value = true;
}, {immediate: true});

onBeforeMount(async () => {
  if($q.platform.is.mobile) {
    prefersQrDisplay.value = false;
  }

  // Initialize selected protocol if not set or if default is not available
  if(availableProtocols.value.length > 0) {
    // Prefer OID4VP-draft18 if available, otherwise use first available
    const protocols = availableProtocols.value;
    if(!selectedProtocol.value || !protocols.includes(selectedProtocol.value)) {
      selectedProtocol.value = protocols.includes('OID4VP-draft18') ?
        'OID4VP-draft18' : protocols[0];
    }
  }
});

const checkStatus = async () => {
  if(!context.value || !context.value.rp?.clientId ||
    !context.value.exchangeData?.id) {
    return;
  }

  // Check if exchange TTL has expired and show appropriate error if so
  const ttlDate = new Date(
    new Date(context.value.exchangeData.createdAt).getTime() +
      context.value.exchangeData.ttl * 1000);
  if(ttlDate < new Date()) {
    $cookies.remove('accessToken');
    $cookies.remove('exchangeId');
    handleError({
      title: translate('exchangeErrorTitle'),
      subtitle: translate('exchangeErrorSubtitle'),
      message: translate('exchangeErrorTtlExpired'),
      resettable: true
    });
  }

  if(state.error && state.intervalId) {
    state.intervalId = clearInterval(state.intervalId);
    return;
  }

  if(state.statusCheckCount > 10) {
    state.intervalId = clearInterval(state.intervalId);
  }

  try {
    let exchange = {};
    ({
      data: {exchange},
    } = await httpClient.get(
      `/workflows/${context.value.rp.clientId}/exchanges/` +
      `${context.value?.exchangeData?.id}`,
      {
        headers: {
          Authorization: `Bearer ${context.value.exchangeData.accessToken}`
        }
      }
    ));
    if(!Object.keys(exchange).length) {
      handleError({
        title: translate('exchangeErrorTitle'),
        subtitle: translate('exchangeErrorSubtitle'),
        message: 'An error occurred while checking exchange status.'
      });
      return;
    }
    if(context.value.exchangeData?.state != exchange.state) {
      // if the exchange has just changed state, it is pretty active
      // so reset the status check count to avoid bothering the user soon.
      state.statusCheckCount = 0;
    }
    context.value.exchangeData = {...context.value.exchangeData, ...exchange};

    if(exchange.state === 'complete') {
      state.intervalId = clearInterval(state.intervalId);
      state.active = false;
      state.activeOverride = false;
      $cookies.remove('accessToken');
      $cookies.remove('exchangeId');
    } else if(exchange.state === 'active' && !state.activeOverride) {
      state.active = true;
    } else if(exchange.state === 'invalid') {
      handleError({
        title: translate('exchangeErrorTitle'),
        subtitle: translate('exchangeErrorSubtitle'),
        message: Object.values(exchange.variables.results ?? {})
          .filter(v => !!v.errors?.length)?.map(r => r.errors)
          .flat()
          .join(', ') ?? 'An error occurred while processing the exchange.',
        resettable: true
      });
    }

  } catch(e) {
    console.error('An error occurred while polling the endpoint:', e);
    handleError({
      title: 'Error',
      message: 'An error occurred while checking exchange status.'
    });
  }

  state.statusCheckCount++;
};

const startStatusCheck = (hurry = false) => {
  state.statusCheckCount = 0;
  if(state.intervalId) {
    state.intervalId = clearInterval(state.intervalId);
  }
  state.intervalId = setInterval(checkStatus, 5000);
  if(hurry) {
    checkStatus();
  }
};

const handleResetExchange = async () => {
  state.active = true;
  state.activeOverride = false;

  try {
    const resetResult = await httpClient.post(
      `/workflows/${context.value.rp.clientId}/exchanges/` +
    `${context.value.exchangeData.id}/reset`,
      {
        headers: {
          Authorization: `Bearer ${context.value.exchangeData.accessToken}`
        }
      }
    );
    const exchangeData = {
      ...resetResult.data
    };
    // Only generate QR code if OID4VP is available
    if(resetResult.data.OID4VP) {
      exchangeData.QR = await QRCode.toDataURL(resetResult.data.OID4VP);
    }
    context.value.exchangeData = exchangeData;
    state.error = null;
    startStatusCheck();
  } catch(e) {
    handleError({
      title: 'Error',
      message: 'An error occurred while resetting the exchange.'
    });
    // Fall through to clear the active state after causing the error to display
  }

  state.active = false;
  state.activeOverride = false;
};

const handleStatusDialogAction = action => {
  if(action === 'resume') {
    startStatusCheck(true);
  } else if(action === 'reset') {
    handleResetExchange();
  }
};

onMounted(async () => {
  setTimeout(checkStatus, 500);
  startStatusCheck();
});

onUnmounted(() => {
  if(state.intervalId) {
    state.intervalId = clearInterval(state.intervalId);
  }
});
</script>

