<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div>
    <!-- Priority-based interaction display -->
    <DcApiInteraction
      v-if="activePickerEntry?.method === 'dcapi'"
      :key="`dcapi:${activePickerEntry.profile || 'all'}`"
      :exchange-data="exchangeData"
      :wallets-registry="WALLETS_REGISTRY"
      :wallet-ids="activePickerEntry.walletIds || []"
      :profile="activePickerEntry.profile || null"
      :error="interactionState.dcApiError"
      :active="isActive"
      :fallback-entry="fallbackPickerEntry"
      @launch="handleDcApiLaunch"
      @retry="handleDcApiRetry"
      @fallback="handleDcApiFallback" />
    <QrAndLinkInteraction
      v-else-if="activePickerEntry?.method === 'qr-and-link'"
      :exchange-data="exchangeData"
      :active="isActive"
      :profile="activePickerEntry.profile"
      :deep-link-url="protocolUrl"
      :wallets-registry="WALLETS_REGISTRY"
      :compatible-wallets="compatibleWalletsForActiveEntry"
      :workflow="workflow"
      @launch="handleSameDeviceLaunch" />
    <QrAndCopyInteraction
      v-else-if="activePickerEntry?.method === 'qr-and-copy'"
      :exchange-data="exchangeData"
      :active="isActive"
      :profile="activePickerEntry.profile"
      :wallets-registry="WALLETS_REGISTRY"
      :compatible-wallets="compatibleWalletsForActiveEntry"
      :workflow="workflow"
      @launch="handleSameDeviceLaunch" />
    <ChapiInteraction
      v-else-if="activePickerEntry?.method === 'chapi'"
      :exchange-data="exchangeData"
      :active="isActive"
      @activate="handleChapiActivate"
      @error="handleChapiError" />
    <div v-else>
      <p class="text-left text-sm mb-2 text-gray-900">
        No wallet interaction available. This may be a configuration error, or
        your current device may not support a connection method that supports
        any of the requested credential types.
      </p>
    </div>
  </div>
</template>

<script setup>
import ChapiInteraction from './interactions/ChapiInteraction.vue';
import {computed} from 'vue';
import DcApiInteraction from './interactions/DcApiInteraction.vue';
import {httpClient} from '@digitalbazaar/http-client';
import QrAndCopyInteraction from './interactions/QrAndCopyInteraction.vue';
import QrAndLinkInteraction from './interactions/QrAndLinkInteraction.vue';
import {startDCApiFlow as startDCApiFlowUtil} from '../utils/dcapi.js';
import {useExchange} from '../composables/useExchange.js';
import {useWalletInteraction} from '../composables/useWalletInteraction.js';
import {WALLETS_REGISTRY} from '../../common/wallets/index.js';

const {
  exchangeData, workflow, isActive, updateExchange
} = useExchange();

const {
  activePickerEntry, interactionState, pickerEntries,
  handleDcApiRetry, handlePickerSelect
} = useWalletInteraction();

const protocolUrl = computed(() => {
  const entry = activePickerEntry.value;
  if(entry?.profile && exchangeData.value?.protocols?.[entry.profile]) {
    return exchangeData.value.protocols[entry.profile];
  }
  if(!exchangeData.value?.protocols) {
    return exchangeData.value?.OID4VP || '';
  }
  const protocolKeys = Object.keys(exchangeData.value.protocols);
  if(protocolKeys.length > 0) {
    return exchangeData.value.protocols[protocolKeys[0]] ||
      exchangeData.value.OID4VP || '';
  }
  return exchangeData.value.OID4VP || '';
});

const compatibleWalletsForActiveEntry = computed(() => {
  const entry = activePickerEntry.value;
  if(!entry || !entry.profile) {
    return [];
  }
  if(entry.method === 'qr-and-link' || entry.method === 'qr-and-copy') {
    const walletEntries = (entry.walletIds || [])
      .filter(wid => WALLETS_REGISTRY[wid])
      .map(walletId => ({walletId, profile: entry.profile}));
    if(walletEntries.length === 0 &&
      exchangeData.value?.protocols?.[entry.profile]) {
      return [{walletId: entry.profile, profile: entry.profile}];
    }
    return walletEntries;
  }
  return [];
});

// Compute the next picker entry after the active one — used to offer
// a "Try another way" shortcut when the DC API flow has failed (e.g.
// the workflow's hybrid query lets the user fall back from mDoc-over-
// DC-API to OID4VP qr-and-link for a JWT VC).
const fallbackPickerEntry = computed(() => {
  const entries = pickerEntries.value || [];
  const active = activePickerEntry.value;
  if(!active || entries.length < 2) {
    return null;
  }
  const activeIdx = entries.findIndex(
    e => e.method === active.method && e.profile === active.profile);
  for(let i = activeIdx + 1; i < entries.length; i++) {
    const next = entries[i];
    if(next && (next.walletIds?.length ?? 0) > 0) {
      return next;
    }
  }
  return null;
});

const handleDcApiFallback = () => {
  const next = fallbackPickerEntry.value;
  if(!next) {
    return;
  }
  interactionState.dcApiError = null;
  handlePickerSelect(next);
};

const handleDcApiLaunch = async ({profile, walletId}) => {
  if(!profile) {
    throw new Error('Profile is required');
  }
  try {
    await startDCApiFlowUtil({
      exchangeData: exchangeData.value,
      httpClient,
      onExchangeUpdate: updatedExchange => {
        updateExchange(updatedExchange);
      },
      selectedProtocol: profile
    });
  } catch(error) {
    console.error('DC API flow error:', {walletId, profile}, error);
    interactionState.dcApiError = {
      message: error.message ||
        'An error occurred while starting the DC API flow.'
    };
  }
};

const handleSameDeviceLaunch = ({walletId, profile}) => {
  handleDcApiLaunch({walletId, profile});
};

const handleChapiActivate = () => {
  // CHAPI activation is handled by ChapiInteraction component
};

const handleChapiError = error => {
  console.error('CHAPI error:', error);
};
</script>
