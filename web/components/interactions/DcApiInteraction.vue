<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="flex flex-col items-center justify-center">
    <!-- Error State -->
    <div
      v-if="error"
      class="flex flex-col items-center">
      <p class="text-red-600 mb-4 text-center">
        <span class="font-bold">
          Error receiving credential from wallet.
        </span>
        <br>
        <span class="text-sm">{{error.message || error}}</span>
      </p>
      <div class="flex gap-4">
        <cadmv-button
          variant="primary"
          :loading="!error && active"
          :disabled="!error && active"
          @click="handleRetry">
          {{$t('dcApiRetry')}}
        </cadmv-button>
        <cadmv-button
          v-if="shouldShowTryAnotherWay"
          variant="secondary"
          :loading="!error && active"
          :disabled="!error && active"
          @click="handleTryAnotherWay">
          {{$t('dcApiFallback')}}
        </cadmv-button>
      </div>
    </div>
    <!-- Normal State: generic platform-based launch buttons -->
    <div
      v-else
      class="flex flex-col gap-3 max-w-md mx-auto">
      <cadmv-button
        v-for="button in availableButtons"
        :key="button.protocolId"
        variant="primary"
        :loading="active"
        :disabled="active"
        :class="['w-full', 'justify-start']"
        @click="handleLaunch(button.protocolId)">
        <div class="flex items-center gap-3 flex-grow min-w-0 overflow-hidden">
          <q-icon
            :name="button.icon"
            size="32px"
            class="flex-shrink-0 text-current" />
          <span class="font-medium text-left truncate min-w-0">
            {{button.label}}
          </span>
        </div>
      </cadmv-button>
      <p v-if="availableButtons.length === 0">
        No compatible wallet found.
      </p>
    </div>
    <!-- Countdown Display -->
    <p
      v-if="exchangeData?.createdAt && exchangeData?.ttl"
      class="text-gray-900 mt-4">
      {{$t('exchangeActiveExpiryMessage')}}
      <CountdownDisplay
        :created-at="exchangeData.createdAt"
        :ttl="exchangeData.ttl" />
    </p>
  </div>
</template>

<script setup>
import {QIcon, useQuasar} from 'quasar';
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
import {computed} from 'vue';
import CountdownDisplay from '../CountdownDisplay.vue';
import {useI18n} from 'vue-i18n';

const props = defineProps({
  exchangeData: {
    type: Object,
    required: true
  },
  active: {
    type: Boolean,
    default: false
  },
  error: {
    type: [Object, String],
    default: null
  },
  hasMultipleInteractionOptions: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits([
  'errorOverride',
  'launch',
  'retry',
  'switchInteractionMethod'
]);

const $q = useQuasar();
const {t} = useI18n({useScope: 'global'});

const isIOS = computed(() => $q.platform?.is?.ios ?? false);
const isAndroid = computed(() => $q.platform?.is?.android ?? false);

const showAnnexC = computed(() => {
  return !!props.exchangeData?.protocols?.['18013-7-Annex-C'];
});

const showAnnexD = computed(() => {
  return !!props.exchangeData?.protocols?.['18013-7-Annex-D'];
});

const availableButtons = computed(() => {
  const buttons = [];

  if(isIOS.value) {
    // iOS: Show one button for Annex-C
    if(showAnnexC.value) {
      buttons.push({
        protocolId: '18013-7-Annex-C',
        label: t('launchWalletAppIOS'),
        icon: 'account_balance_wallet'
      });
    }
  } else if(isAndroid.value) {
    // Android: Show one button for Annex-D
    if(showAnnexD.value) {
      buttons.push({
        protocolId: '18013-7-Annex-D',
        label: t('launchWalletAppAndroid'),
        icon: 'account_balance_wallet'
      });
    }
  } else {
    // Desktop/Other: Show both buttons
    if(showAnnexC.value) {
      buttons.push({
        protocolId: '18013-7-Annex-C',
        label: t('launchWalletAppIOS'),
        icon: 'phone_iphone'
      });
    }
    if(showAnnexD.value) {
      buttons.push({
        protocolId: '18013-7-Annex-D',
        label: t('launchWalletAppAndroid'),
        icon: 'phone_android'
      });
    }
  }

  return buttons;
});

// Determine if "Try Another Way" button should be shown
// Show only when there's an error AND there are multiple interaction
// options available (matching picker logic)
const shouldShowTryAnotherWay = computed(() => {
  return !!props.error && props.hasMultipleInteractionOptions;
});

const handleLaunch = protocolId => {
  emit('launch', {protocolId});
};

const handleTryAnotherWay = () => {
  emit('switchInteractionMethod', null);
};

const handleRetry = () => {
  emit('retry');
};
</script>
