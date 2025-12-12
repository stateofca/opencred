<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div>
    <div
      v-if="context.exchangeData?.state === 'complete'"
      class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
             md:px-16 lg:px-24 relative text-center">
      <!-- Completion handled by parent -->
    </div>
    <div
      v-else-if="state.error"
      class="flex justify-center pt-8">
      <ErrorView
        :title="state.error.title"
        :message="state.error.message"
        :resettable="state.error.resettable"
        @reset="handleResetExchange" />
    </div>
    <div
      v-else
      class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
             md:px-16 lg:px-24 relative">
      <!-- Workflow Title -->
      <h1
        class="text-3xl mb-4 text-center"
        :style="{color: context.workflow.brand?.primary}">
        {{context.workflow.name || $t(`${purpose}Cta`)}}
      </h1>

      <!-- Workflow Description -->
      <div class="mb-4 text-gray-900">
        <p
          v-if="context.workflow.description"
          class="text-gray-900"
          v-html="context.workflow.description" />
        <p
          class="text-gray-900"
          v-html="$t('exchangePageExplain')" />
      </div>

      <!-- Credential Query Summary -->
      <CredentialQuerySummary
        :workflow="context.workflow"
        :exchange-data="context.exchangeData || {}" />

      <!-- Connect Your Wallet Heading -->
      <p class="text-md font-semibold mb-2 text-gray-900">
        {{$t('connectWalletHeading')}}
      </p>

      <!-- Wallet Selection -->
      <WalletSelection
        :selected-wallet="selectedWallet"
        :selected-protocol="selectedProtocol"
        :available-protocols="availableProtocols"
        :wallets-registry="walletsRegistry"
        :protocols-registry="protocolsRegistry"
        :workflow="context.workflow"
        @select-protocol="handleSelectProtocol" />

      <!-- Interaction-specific info and exchange status -->
      <WalletInteraction
        :exchange-data="context.exchangeData || {}"
        :exchange-state="context.exchangeData?.state || 'pending'"
        :selected-protocol="selectedProtocol"
        :selected-wallet="selectedWallet"
        :available-protocols="availableProtocols"
        :active="state.active && !state.activeOverride"
        :workflow="context.workflow"
        :wallets-registry="walletsRegistry"
        :protocols-registry="protocolsRegistry"
        :interaction-state="interactionState"
        @update-interaction-state="handleUpdateInteractionState"
        @replace-exchange="handleReplaceExchange" />

      <!-- Explainer Video Link -->
      <div class="mt-2">
        <button
          v-if="$t('qrExplainerText') !== '' &&
            context.workflow.brand?.explainerVideo?.id !== '' &&
            context.workflow.brand?.explainerVideo?.provider"
          :style="{color: context.workflow.brand?.primary}"
          class="underline"
          @click="showVideo = true">
          {{$t('qrExplainerText')}}
        </button>
        <p
          v-if="$t('qrFooterHelp')"
          class="mt-2 text-gray-900"
          v-html="$t('qrFooterHelp')" />
      </div>

      <!-- Explainer Video Dialog -->
      <q-dialog
        v-model="showVideo">
        <q-card>
          <YouTubeVideo
            v-if="context.workflow.brand?.explainerVideo?.provider
              === 'youtube'"
            :id="context.workflow.brand.explainerVideo.id" />
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

    <!-- Status Dialog -->
    <CadmvDialog
      v-if="context.exchangeData?.state !== 'complete' &&
        state.statusCheckCount > 20"
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
import CredentialQuerySummary from './CredentialQuerySummary.vue';
import ErrorView from './ErrorView.vue';
import {httpClient} from '@digitalbazaar/http-client';
import {PROTOCOLS_REGISTRY} from '../utils/protocols.js';
import QRCode from 'qrcode';
import {useI18n} from 'vue-i18n';
import {useQuasar} from 'quasar';
import WalletInteraction from './WalletInteraction.vue';
import {WALLETS_REGISTRY} from '../utils/wallets.js';
import WalletSelection from './WalletSelection.vue';

defineProps({
  purpose: {
    type: String,
    default: 'verification',
    validator: value => ['verification', 'login'].includes(value)
  }
});

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
const selectedWallet = ref('cadmv-wallet');

// Interaction state management
const interactionState = reactive({
  dcApiErrorOverride: false,
  // User preference for same device vs remote (QR/DC API)
  prefersSameDevice: false,
  dcApiState: {},
  chapiState: {},
  qrState: {},
  sameDeviceState: {},
  errors: {
    dcApiError: null,
    qrError: null,
    exchangeError: null,
    sameDeviceLinkError: null
  }
});

const walletsRegistry = WALLETS_REGISTRY;
const protocolsRegistry = PROTOCOLS_REGISTRY;

const showVideo = ref(false);

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

const handleSelectProtocol = ({protocol, wallet, prefersSameDevice}) => {
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
  if(prefersSameDevice !== undefined) {
    interactionState.prefersSameDevice = prefersSameDevice;
  }
};

const handleUpdateInteractionState = updates => {
  Object.assign(interactionState, updates);
  // Handle nested errors object updates
  if(updates.errors) {
    Object.assign(interactionState.errors, updates.errors);
  }
};

const handleReplaceExchange = updatedExchange => {
  context.value.exchangeData = {
    ...context.value.exchangeData,
    ...updatedExchange
  };
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
      walletsRegistry[cookieWallet]?.supportedProtocols?.[
        selectedProtocol.value]) {
      selectedWallet.value = cookieWallet;
    }
  }

  cookiesLoaded.value = true;
}, {immediate: true});

onBeforeMount(async () => {
  if($q.platform.is.mobile) {
    interactionState.prefersSameDevice = true;
  }

  // Initialize selected protocol if not set or if default is not available
  if(availableProtocols.value.length > 0) {
    const protocols = availableProtocols.value;
    if(!selectedProtocol.value || !protocols.includes(selectedProtocol.value)) {
      // Use wallet's getDefaultProtocol function if available
      const wallet = selectedWallet.value ?
        walletsRegistry[selectedWallet.value] : null;
      if(wallet?.getDefaultProtocol) {
        const defaultProtocol = wallet.getDefaultProtocol({
          workflow: context.value?.workflow,
          availableProtocols: protocols
        });
        if(defaultProtocol && protocols.includes(defaultProtocol)) {
          selectedProtocol.value = defaultProtocol;
        } else {
          selectedProtocol.value = protocols[0];
        }
      } else {
        // Default: prefer OID4VP-draft18
        selectedProtocol.value = protocols.includes('OID4VP-draft18') ?
          'OID4VP-draft18' : protocols[0];
      }
    }
  }
});

const checkStatus = async () => {
  if(!context.value || !context.value.workflow?.clientId ||
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

  if(state.statusCheckCount > 20) {
    state.intervalId = clearInterval(state.intervalId);
  }

  try {
    let exchange = {};
    ({
      data: {exchange},
    } = await httpClient.get(
      `/workflows/${context.value.workflow.clientId}/exchanges/` +
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
      `/workflows/${context.value.workflow.clientId}/exchanges/` +
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

