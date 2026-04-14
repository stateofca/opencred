<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <CadmvMainCard
    :title="t('exchangePageTitle', context.workflow.name)"
    :subtitle="t('exchangePageExplain', undefined)"
    class="column items-center q-pb-md">
    <div v-if="context.exchangeData?.state === 'complete'" />
    <div
      v-else-if="state.error">
      <ErrorView
        :title="state.error.title"
        :message="state.error.message"
        :resettable="state.error.resettable"
        @reset="handleResetExchange" />
    </div>
    <div
      v-else
      class="column items-center q-gutter-y-lg">
      <!-- Credential Query Summary -->
      <CredentialQuerySummary
        v-if="context.workflow.brand?.showQuerySummary ?? true"
        :workflow="context.workflow"
        :exchange-data="context.exchangeData || {}" />

      <!-- Connect Your Wallet Heading -->
      <p class="text-body1 text-weight-bold text-heading">
        {{t('connectWalletHeading')}}
      </p>

      <!-- Interaction-specific info and exchange status -->
      <WalletInteraction
        ref="walletInteractionRef"
        :available-protocols="availableProtocols"
        :user-settings="userSettings"
        :workflow="context.workflow"
        :active="state.active"
        @replace-exchange="handleReplaceExchange"
        @launch="handleDcApiLaunch"
        @update:active-interaction-type="activeInteractionType = $event" />

      <!-- Explainer Video Link -->
      <div class="mt-2">
        <button
          v-if="t('qrExplainerText') !== '' &&
            context.workflow.brand?.explainerVideo?.id !== '' &&
            context.workflow.brand?.explainerVideo?.provider"
          :style="{color: context.workflow.brand?.primary}"
          class="underline"
          @click="showVideo = true">
          {{t('qrExplainerText')}}
        </button>
        <p
          v-if="t('qrFooterHelp')"
          class="mt-2 text-gray-900"
          v-html="t('qrFooterHelp')" />
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
              :label="t('close')" />
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
          <span class="text-bold">
            {{t('statusDialog_areYouStillThere')}} </span>
          {{t('statusDialog_statusPaused')}}
        </p>
      </template>
    </CadmvDialog>
  </CadmvMainCard>
</template>

<script setup>
import {CadmvDialog, CadmvMainCard} from '@digitalbazaar/cadmv-ui';
import {computed, inject, nextTick, onMounted, onUnmounted,
  reactive, ref} from 'vue';
import CredentialQuerySummary from './CredentialQuerySummary.vue';
import ErrorView from './ErrorView.vue';
import {httpClient} from '@digitalbazaar/http-client';
import QRCode from 'qrcode';
import {useExchangeContext} from '../composables/useExchangeContext.js';
import {useReactiveI18n} from '../composables/useReactiveI18n.js';

// import {useI18n} from 'vue-i18n';
import WalletInteraction from './WalletInteraction.vue';

defineProps({
  purpose: {
    type: String,
    default: 'verification',
    validator: value => ['verification', 'login'].includes(value)
  }
});

const {context, translations} = useExchangeContext();

// Check context and userSettings
if(!context) {
  throw new Error(
    'OpenCredExchange requires exchangeContext to be provided by parent ' +
    'component'
  );
}

const userSettings = inject('userSettings', ref(
  {enabledWallets: [], enabledProtocols: []}));

// Use workflow translations if available
const {t} = useReactiveI18n({messages: translations});

const state = reactive({
  active: false,
  error: null,
  intervalId: null,
  statusCheckCount: 0
});

const activeInteractionType = ref(null);
const walletInteractionRef = ref(null);

const showVideo = ref(false);

const statusDialogActions = [
  {
    actionId: 'resume',
    variant: 'primary',
    label: t('statusDialog_resumeChecking')
  },
  {
    actionId: 'reset',
    variant: 'flat',
    label: t('statusDialog_resetSession')
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
 *
 * @param {object} error - Error object to display.
 * @param {string} [error.title] - Error title.
 * @param {string} [error.message] - Error message.
 * @param {boolean} [error.resettable] - Whether the error can be reset.
 */
const handleError = error => {
  state.intervalId = clearInterval(state.intervalId);
  state.error = {
    title: error?.title || t('error_defaultTitle'),
    subtitle: error?.subtitle || t('error_defaultSubtitle'),
    message: error?.message || t('error_unexpectedMessage'),
    resettable: !!error?.resettable || false
  };
  state.active = false;
  state.statusCheckCount = 0;
};

const handleDcApiLaunch = ({protocolId}) => {
  // Launch DC API directly with wallet/protocol
  nextTick(() => {
    walletInteractionRef.value?.launchDcApi?.(protocolId);
  });
};

const handleReplaceExchange = updatedExchange => {
  context.value.exchangeData = {
    ...context.value.exchangeData,
    ...updatedExchange
  };
};

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
    handleError({
      title: t('exchangeErrorTitle'),
      subtitle: t('exchangeErrorSubtitle'),
      message: t('exchangeErrorTtlExpired'),
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
      data: {exchange}
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
        title: t('exchangeErrorTitle'),
        subtitle: t('exchangeErrorSubtitle'),
        message: t('exchangeStatus_checkError')
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
    } else if(exchange.state === 'active') {
      state.active = true;
    } else if(exchange.state === 'invalid') {
      handleError({
        title: t('exchangeErrorTitle'),
        subtitle: t('exchangeErrorSubtitle'),
        message: Object.values(exchange.variables.results ?? {})
          .filter(v => !!v.errors?.length)?.map(r => r.errors)
          .flat()
          .join(', ') ?? t('exchangeStatus_processError'),
        resettable: true
      });
    }

  } catch(e) {
    console.error('An error occurred while polling the endpoint:', e);
    handleError({
      title: t('error_defaultTitle'),
      message: t('exchangeStatus_checkError')
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
  } catch {
    handleError({
      title: t('error_defaultTitle'),
      message: t('exchangeStatus_resetError')
    });
    // Fall through to clear the active state after causing the error to display
  }

  state.active = false;
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
