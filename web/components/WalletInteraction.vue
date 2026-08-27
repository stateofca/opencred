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
      :descriptors="activePickerEntry.buttons || []"
      :active-descriptor-id="launchState.activeDescriptorId"
      :error="launchState.error"
      :fallback-entry="fallbackPickerEntry"
      @launch="launch"
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
        {{$t('noInteractionAvailableMessage')}}
      </p>
    </div>
  </div>
</template>

<script setup>
import ChapiInteraction from './interactions/ChapiInteraction.vue';
import {computed} from 'vue';
import DcApiInteraction from './interactions/DcApiInteraction.vue';
import QrAndCopyInteraction from './interactions/QrAndCopyInteraction.vue';
import QrAndLinkInteraction from './interactions/QrAndLinkInteraction.vue';
import {useDcApiLaunch} from '../composables/useDcApiLaunch.js';
import {useExchange} from '../composables/useExchange.js';
import {useWalletInteraction} from '../composables/useWalletInteraction.js';
import {WALLETS_REGISTRY} from '../../common/wallets/index.js';

const {
  exchangeData, workflow, isActive
} = useExchange();

const {
  activePickerEntry, pickerEntries,
  handlePickerSelect, handleDcApiRetry: retryPickerEntry
} = useWalletInteraction();

// DC API launch state and the launch itself live in the composable, so this
// component is left routing between interaction methods.
const {launchState, launch, reset: resetDcApiLaunch} = useDcApiLaunch();

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
  resetDcApiLaunch();
  handlePickerSelect(next);
};

const handleDcApiRetry = () => {
  resetDcApiLaunch();
  retryPickerEntry();
};

// The QR/link screens offer a same-device launch, which runs the same DC API
// flow for the single profile that screen is showing. Routed through the same
// composable as a one-profile launch option, so there is one launch path.
const handleSameDeviceLaunch = ({walletId, profile}) => {
  launch({id: walletId ?? profile, profiles: [profile]});
};

const handleChapiActivate = () => {
  // CHAPI activation is handled by ChapiInteraction component
};

const handleChapiError = error => {
  console.error('CHAPI error:', error);
};
</script>
