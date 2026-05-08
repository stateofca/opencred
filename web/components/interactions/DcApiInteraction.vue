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
      </div>
    </div>
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
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
import {computed} from 'vue';
import CountdownDisplay from '../CountdownDisplay.vue';
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
  }
});

const emit = defineEmits([
  'launch',
  'retry'
]);

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
</script>
