<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <CadmvMainCard
    :title="t('exchangePageTitle', context.workflow.name)"
    :subtitle="t('exchangePageExplain', undefined)"
    class="opencred-main-card column items-center q-pb-md">
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
      <p
        v-if="te('connectWalletHeading')"
        class="text-body1 text-weight-bold text-heading">
        {{t('connectWalletHeading')}}
      </p>

      <!-- Interaction-specific info and exchange status -->
      <WalletInteraction />

      <!-- "Other ways to connect" link + picker -->
      <div
        v-if="pickerEntries.length > 1"
        class="column items-center mt-4 mx-auto text-center">
        <a
          href="#"
          class="text-sm underline"
          @click.prevent="showInteractionPicker = true">
          {{t('interactionPicker_otherWaysLink')}}
        </a>
      </div>
      <InteractionPickerModal
        v-model="showInteractionPicker"
        :picker-entries="pickerEntries"
        :current-entry="activePickerEntry"
        :wallets-registry="WALLETS_REGISTRY"
        @select="handlePickerSelect" />

      <!-- Explainer Video Link -->
      <div class="mt-2">
        <button
          v-if="te('qrExplainerText') &&
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

      <!-- Suggested Apps -->
      <SuggestedApps />

      <!-- Powered by OpenCred + Debug -->
      <div class="column items-center mt-4 mx-auto text-center">
        Powered by OpenCred
      </div>
    </div>

    <DebugDisplay />
  </CadmvMainCard>
</template>

<script setup>
import {onMounted, onUnmounted, reactive, ref} from 'vue';
import {CadmvMainCard} from '@digitalbazaar/cadmv-ui';
import CredentialQuerySummary from './CredentialQuerySummary.vue';
import DebugDisplay from './DebugDisplay.vue';
import ErrorView from './ErrorView.vue';
import {httpClient} from '@digitalbazaar/http-client';
import InteractionPickerModal from './InteractionPickerModal.vue';
import QRCode from 'qrcode';
import SuggestedApps from './SuggestedApps.vue';
import {useExchange} from '../composables/useExchange.js';
import {useReactiveI18n} from '../composables/useReactiveI18n.js';
import {useWalletInteraction} from '../composables/useWalletInteraction.js';
import WalletInteraction from './WalletInteraction.vue';
import {WALLETS_REGISTRY} from '../../common/wallets/index.js';

defineProps({
  purpose: {
    type: String,
    default: 'verification',
    validator: value => ['verification', 'login'].includes(value)
  }
});

const {context, updateExchange} = useExchange();

if(!context) {
  throw new Error(
    'OpenCredExchange requires exchangeContext to be provided by parent ' +
    'component'
  );
}

const {t, te} = useReactiveI18n();

const {
  pickerEntries, activePickerEntry, handlePickerSelect
} = useWalletInteraction();

const state = reactive({
  active: false,
  error: null,
  intervalId: null,
  statusCheckCount: 0
});

const showInteractionPicker = ref(false);
const showVideo = ref(false);

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

const checkStatus = async () => {
  if(!context.value || !context.value.workflow?.clientId ||
    !context.value.exchangeData?.id) {
    return;
  }

  // Check client-side whether exchange has expired before polling
  const expiresStr = context.value.exchangeData.expires;
  if(expiresStr && Date.now() >= new Date(expiresStr).getTime()) {
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
      state.statusCheckCount = 0;
    }
    updateExchange(exchange);

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

const startStatusCheck = () => {
  state.statusCheckCount = 0;
  if(state.intervalId) {
    state.intervalId = clearInterval(state.intervalId);
  }
  state.intervalId = setInterval(checkStatus, 5000);
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
