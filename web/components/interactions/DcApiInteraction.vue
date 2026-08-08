<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="flex flex-col items-center justify-center">
    <!-- Error State -->
    <CadmvBanner
      v-if="error"
      class="w-full max-w-md"
      variant="error"
      :dismissible="false"
      :text="errorMessage">
      <template #action>
        <cadmv-button
          flat
          dense
          class="error-action error-action--primary"
          @click="handleRetry">
          {{$t('dcApiRetry')}}
        </cadmv-button>
        <cadmv-button
          v-if="fallbackEntry"
          flat
          dense
          class="error-action error-action--primary"
          @click="handleFallback">
          {{$t('dcApiFallback')}}
        </cadmv-button>
      </template>
    </CadmvBanner>
    <!-- Normal State: one launch button per configured or derived option -->
    <div
      v-else
      class="flex flex-col gap-3 max-w-md mx-auto">
      <template
        v-for="descriptor in descriptors"
        :key="descriptor.id">
        <WalletLaunchButton
          :label="resolveLabel(descriptor)"
          :loading="activeDescriptorId === descriptor.id"
          :disabled="activeDescriptorId !== null"
          @launch="handleLaunch(descriptor)" />
        <p
          v-if="!descriptor.walletBranded"
          class="text-xs text-gray-600 text-center mb-0">
          <template v-if="handlingWalletNames(descriptor).length > 0">
            {{$t('dcApiSingleProfile_handledBy', {
              names: handlingWalletNames(descriptor).join(', ')
            })}}
          </template>
          <template v-else>
            {{$t('dcApiSingleProfile_handledByNone')}}
          </template>
        </p>
      </template>
      <p v-if="descriptors.length === 0">
        {{$t('noCompatibleWalletMessage')}}
      </p>
    </div>
    <CountdownDisplay
      :expires="exchangeData.expires"
      :display-threshold="exchangeTtlDisplayThresholdSeconds"
      wrapper-class="q-mx-md text-center" />
  </div>
</template>

<script setup>
import {CadmvBanner, CadmvButton} from '@digitalbazaar/cadmv-ui';
import {computed, watch} from 'vue';
import CountdownDisplay from '../CountdownDisplay.vue';
import {resolveDcApiErrorMessage} from '../../utils/dc-api-error-message.js';
import {useExchangeOptions} from '../../composables/useExchangeOptions.js';
import {useI18n} from 'vue-i18n';
import WalletLaunchButton from '../WalletLaunchButton.vue';

const {t, te} = useI18n({useScope: 'global'});
const {exchangeTtlDisplayThresholdSeconds} = useExchangeOptions();

const props = defineProps({
  exchangeData: {
    type: Object,
    required: true
  },
  // Launch-option descriptors from the active picker entry, derived in
  // `common/wallets/exchange-options.js`. Each is one button and every profile
  // it requests together in a single `navigator.credentials.get()` call, so a
  // configured Apple + Google button and a derived per-wallet button render
  // through the same code path. Descriptors carry their own label and
  // "handled by" inputs, so this component needs no wallet registry access.
  descriptors: {
    type: Array,
    default: () => []
  },
  // Which descriptor is currently in flight, so only the pressed button shows a
  // loading state.
  activeDescriptorId: {
    type: String,
    default: null
  },
  error: {
    type: [Object, String],
    default: null
  },
  // The next picker entry to offer as a quick "Try another way"
  // fallback when the DC API flow has failed (e.g. user canceled, or
  // their wallet didn't have the requested credential). Pass `null` to
  // hide the fallback button.
  fallbackEntry: {
    type: Object,
    default: null
  }
});

const emit = defineEmits([
  'launch',
  'retry',
  'fallback'
]);

const errorMessage = computed(() =>
  resolveDcApiErrorMessage({error: props.error, t}));

watch(() => props.error, value => {
  if(value) {
    console.warn('[DcApiInteraction] error detail:', value);
  }
});

// Label precedence, mirroring `successViewFields`: an i18n key when it resolves
// in the current locale, then a literal label, then the generic fallback.
const resolveLabel = descriptor => {
  if(descriptor.labelKey && te(descriptor.labelKey)) {
    return t(descriptor.labelKey);
  }
  if(descriptor.label) {
    return descriptor.label;
  }
  return t('dcApiSingleProfile_buttonLabel');
};

// Names for the "may be handled by" hint. Shown only for descriptors that are
// not wallet-branded, since a wallet-branded button already names its wallet.
const handlingWalletNames = descriptor =>
  (descriptor.handledBy ?? []).map(
    handled => handled.nameKey && te(handled.nameKey) ?
      t(handled.nameKey) : (handled.name || handled.walletId));

const handleLaunch = descriptor => {
  emit('launch', descriptor);
};

const handleRetry = () => {
  emit('retry');
};

const handleFallback = () => {
  emit('fallback');
};
</script>

<style scoped>
:deep(.q-banner__content.text-body2) {
  font-size: 0.75rem;
}

:deep(.error-action.custom-btn) {
  min-width: 0;
  padding: 0.5rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1.0;
  white-space: normal;
}
:deep(.error-action--primary.custom-btn) {
  font-weight: 600;
  border: 1px solid var(--q-negative);
}
:deep(.error-action--primary.custom-btn:not(:last-child)) {
  margin-right: 0.5rem;
}
</style>
