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
    <!-- Normal State: wallet-branded launch buttons -->
    <div
      v-else
      class="flex flex-col gap-3 max-w-md mx-auto">
      <template v-if="singleProfileMode">
        <WalletLaunchButton
          :profile="profile"
          :label="$t('dcApiSingleProfile_buttonLabel')"
          :loading="active"
          :disabled="active"
          @launch="handleLaunch" />
        <p class="text-xs text-gray-600 text-center mb-0">
          <template v-if="singleProfileHandlingWalletNames.length > 0">
            {{$t('dcApiSingleProfile_handledBy', {
              names: singleProfileHandlingWalletNames.join(', ')
            })}}
          </template>
          <template v-else>
            {{$t('dcApiSingleProfile_handledByNone')}}
          </template>
        </p>
      </template>
      <template v-else>
        <WalletLaunchButton
          v-for="entry in dcApiWallets"
          :key="entry.walletId"
          :wallet="entry.wallet"
          :wallet-id="entry.walletId"
          :profile="entry.profile"
          :loading="active"
          :disabled="active"
          @launch="handleLaunch" />
        <p v-if="dcApiWallets.length === 0">
          No compatible wallet found.
        </p>
      </template>
    </div>
    <!-- Countdown Display -->
    <p
      v-if="exchangeData?.createdAt && exchangeData?.ttl"
      class="text-gray-900 mt-4 q-mx-md text-center">
      {{$t('exchangeActiveExpiryMessage')}}
      <CountdownDisplay
        :created-at="exchangeData.createdAt"
        :ttl="exchangeData.ttl" />
    </p>
  </div>
</template>

<script setup>
import {CadmvBanner, CadmvButton} from '@digitalbazaar/cadmv-ui';
import {computed, watch} from 'vue';
import CountdownDisplay from '../CountdownDisplay.vue';
import {resolveDcApiErrorMessage} from '../../utils/dc-api-error-message.js';
import {useI18n} from 'vue-i18n';
import WalletLaunchButton from '../WalletLaunchButton.vue';

const {t} = useI18n({useScope: 'global'});

const props = defineProps({
  exchangeData: {
    type: Object,
    required: true
  },
  walletsRegistry: {
    type: Object,
    default: () => ({})
  },
  // Allowlist of wallet IDs from the active picker entry. The picker
  // entry already filters by `workflow.wallets`; we use it here so the
  // launch buttons match the workflow's wallet configuration. Pass
  // `null` to disable filtering.
  walletIds: {
    type: Array,
    default: null
  },
  profile: {
    type: String,
    default: null
  },
  active: {
    type: Boolean,
    default: false
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

const allowedWalletIdSet = computed(() =>
  props.walletIds === null ? null : new Set(props.walletIds));

const dcApiWallets = computed(() => {
  const protocols = props.exchangeData?.protocols;
  if(!protocols || typeof protocols !== 'object') {
    return [];
  }

  const allowed = allowedWalletIdSet.value;
  const entries = [];
  for(const [walletId, wallet] of Object.entries(props.walletsRegistry)) {
    if(allowed && !allowed.has(walletId)) {
      continue;
    }
    if(!wallet?.supportedProfiles) {
      continue;
    }
    for(const [profile, profileConfig] of Object.entries(
      wallet.supportedProfiles)) {
      if(!profileConfig?.dcapi) {
        continue;
      }
      if(protocols[profile]) {
        entries.push({walletId, profile, wallet});
        break;
      }
    }
  }
  return entries;
});

const singleProfileMode = computed(() => !!props.profile);

const singleProfileHandlingWalletNames = computed(() => {
  if(!singleProfileMode.value) {
    return [];
  }
  const allowed = allowedWalletIdSet.value;
  const names = [];
  for(const [walletId, wallet] of
    Object.entries(props.walletsRegistry)) {
    if(allowed && !allowed.has(walletId)) {
      continue;
    }
    const cfg = wallet?.supportedProfiles?.[props.profile];
    if(!cfg?.dcapi) {
      continue;
    }
    const name = wallet?.nameKey ?
      t(wallet.nameKey) : (wallet?.name || walletId);
    names.push(name);
  }
  return names;
});

const handleLaunch = ({walletId, profile}) => {
  emit('launch', {walletId, profile});
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
