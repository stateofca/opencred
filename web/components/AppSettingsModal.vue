<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <ModalDialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)">
    <q-card-section>
      <h3 class="text-lg font-semibold mb-4 text-gray-900">
        {{$t('appSettings_title')}}
      </h3>

      <div class="mb-6">
        <h4 class="text-sm font-medium mb-2 text-gray-700">
          {{$t('appSettings_wallets')}}
        </h4>
        <div class="flex flex-col gap-2">
          <label
            v-for="walletId in walletIds"
            :key="walletId"
            class="flex items-start gap-2 cursor-pointer">
            <input
              v-model="localEnabledWallets"
              type="checkbox"
              :value="walletId"
              class="rounded mt-0.5">
            <div class="flex flex-col">
              <span
                :class="isWalletAvailable(walletId) ?
                  'text-gray-900' : 'text-gray-400 opacity-60'">
                {{walletsRegistry[walletId]?.nameKey ? $t(walletsRegistry[
                  walletId].nameKey) : (walletsRegistry[walletId]?.name ||
                  walletId)}}
              </span>
              <span
                v-if="hasExchangeContext && !isWalletAvailable(walletId)"
                class="text-xs text-amber-600 mt-0.5">
                {{$t('appSettings_notAvailableForExchange')}}
              </span>
            </div>
          </label>
        </div>
      </div>

      <div>
        <h4 class="text-sm font-medium mb-2 text-gray-700">
          {{$t('appSettings_advancedProtocols')}}
        </h4>
        <p class="text-xs text-gray-600 mb-2">
          {{$t('appSettings_protocolsExplain')}}
        </p>
        <div class="flex flex-col gap-2 max-h-48 overflow-y-auto">
          <label
            v-for="protocolId in protocolIds"
            :key="protocolId"
            class="flex items-start gap-2 cursor-pointer">
            <input
              v-model="localEnabledProtocols"
              type="checkbox"
              :value="protocolId"
              class="rounded mt-0.5">
            <div class="flex flex-col">
              <span
                :class="isProtocolAvailable(protocolId) ?
                  'text-gray-900' : 'text-gray-400 opacity-60'">
                {{protocolMetadata[protocolId]?.nameKey ? $t(protocolMetadata[
                  protocolId].nameKey) : protocolId}}
              </span>
              <span
                v-if="hasExchangeContext && !isProtocolAvailable(protocolId)"
                class="text-xs text-amber-600 mt-0.5">
                {{$t('appSettings_notAvailableForExchange')}}
              </span>
            </div>
          </label>
        </div>
      </div>
    </q-card-section>
    <q-card-actions
      align="right">
      <q-btn
        flat
        :label="$t('appSettings_reset')"
        @click="handleReset" />
      <q-btn
        flat
        :label="$t('close')"
        @click="$emit('update:modelValue', false)" />
    </q-card-actions>
  </ModalDialog>
</template>

<script setup>
import {
  canShowOption,
  DEFAULT_USER_SETTINGS
} from '../../common/wallets/canShowOption.js';
import {computed, ref, watch} from 'vue';
import {
  loadUserSettings,
  saveUserSettings,
  WALLETS_REGISTRY
} from '../../common/wallets/index.js';
import {PROTOCOL_METADATA, PROTOCOLS_LIST} from '../../common/protocols.js';
import ModalDialog from './ModalDialog.vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  userSettings: {
    type: Object,
    default: () => ({enabledWallets: [], enabledProtocols: []})
  },
  workflow: {
    type: Object,
    default: null
  },
  availableProtocols: {
    type: Array,
    default: () => []
  },
  exchange: {
    type: Object,
    default: null
  },
  platform: {
    type: Object,
    default: () => ({isIOS: false, isAndroid: false, isMobile: false})
  },
  dcApiSystemAvailable: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue', 'update:userSettings']);

const walletIds = Object.keys(WALLETS_REGISTRY);
const protocolIds = PROTOCOLS_LIST.filter(id => id !== 'vcapi');
const protocolMetadata = PROTOCOL_METADATA;
const walletsRegistry = WALLETS_REGISTRY;

const localEnabledWallets = ref([]);
const localEnabledProtocols = ref([]);

const hasExchangeContext = computed(() =>
  props.workflow && props.availableProtocols?.length > 0
);

const isWalletAvailable = walletId => {
  if(!hasExchangeContext.value) {
    return true;
  }
  const settingsWithWallet = {
    enabledWallets: [...new Set([...localEnabledWallets.value, walletId])],
    enabledProtocols: localEnabledProtocols.value
  };
  const {available} = canShowOption({
    workflow: props.workflow,
    availableProtocols: props.availableProtocols,
    exchange: props.exchange || {},
    platform: props.platform,
    userSettings: settingsWithWallet,
    dcApiSystemAvailable: props.dcApiSystemAvailable,
    walletId
  });
  return available;
};

const isProtocolAvailable = protocolId => {
  if(!hasExchangeContext.value) {
    return true;
  }
  const settingsWithProtocol = {
    enabledWallets: localEnabledWallets.value,
    enabledProtocols: [...new Set([
      ...localEnabledProtocols.value,
      protocolId
    ])]
  };
  const {available} = canShowOption({
    workflow: props.workflow,
    availableProtocols: props.availableProtocols,
    exchange: props.exchange || {},
    platform: props.platform,
    userSettings: settingsWithProtocol,
    dcApiSystemAvailable: props.dcApiSystemAvailable,
    protocolId
  });
  return available;
};

const persistSettings = () => {
  const settings = {
    enabledWallets: [...localEnabledWallets.value],
    enabledProtocols: [...localEnabledProtocols.value]
  };
  saveUserSettings(settings);
  emit('update:userSettings', settings);
};

watch([localEnabledWallets, localEnabledProtocols], persistSettings, {
  deep: true
});

watch(() => props.modelValue, open => {
  if(open) {
    const loaded = loadUserSettings();
    localEnabledWallets.value = loaded.enabledWallets || [];
    localEnabledProtocols.value = loaded.enabledProtocols || [];
    emit('update:userSettings', loaded);
  }
}, {immediate: true});

const handleReset = () => {
  localEnabledWallets.value = [...DEFAULT_USER_SETTINGS.enabledWallets];
  localEnabledProtocols.value = [...DEFAULT_USER_SETTINGS.enabledProtocols];
  persistSettings();
  emit('update:modelValue', false);
};

</script>
