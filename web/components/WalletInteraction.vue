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
      :profile="activePickerEntry.profile || null"
      :error="interactionState.dcApiError"
      :active="isActive"
      @launch="handleDcApiLaunch"
      @retry="handleDcApiRetry" />
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
    <pre
      v-if="isDebugMode"
      class="text-left text-xs mb-2 text-gray-600">
active interaction type: {{activeInteractionType ?? 'null'}}
active picker entry: {{activePickerEntry}}
state: {{exchangeState}}
available profiles: {{availableProfiles}}
active: {{isActive}}
workflow: {{workflow}}
interaction state:
dcApiError={{interactionState.dcApiError}}
dcapi system available: {{dcApiSystemAvailable}}

exchange data:
{{exchangeData}}

workflow:
{{props.workflow}}
    </pre>
  </div>
</template>

<script setup>
import {
  computed, onMounted, reactive, ref, watch
} from 'vue';
import ChapiInteraction from './interactions/ChapiInteraction.vue';
import DcApiInteraction from './interactions/DcApiInteraction.vue';
import {httpClient} from '@digitalbazaar/http-client';
import QrAndCopyInteraction from './interactions/QrAndCopyInteraction.vue';
import QrAndLinkInteraction from './interactions/QrAndLinkInteraction.vue';
import {startDCApiFlow as startDCApiFlowUtil} from '../utils/dcapi.js';
import {useExchangeContext} from '../composables/useExchangeContext.js';
import {useQuasar} from 'quasar';
import {WALLETS_REGISTRY} from '../../common/wallets/index.js';

const props = defineProps({
  availableProfiles: {
    type: Array,
    default: () => []
  },
  userSettings: {
    type: Object,
    default: () => ({enabledWallets: [], enabledProfiles: []})
  },
  workflow: {
    type: Object,
    required: true
  }
});

const emit = defineEmits([
  'replaceExchange',
  'launch',
  'update:activeInteractionType',
  'request-picker'
]);

const interactionState = reactive({
  dcApiError: null,
  activeOverride: false,
  activePickerEntryOverride: null
});

const $q = useQuasar();
const platform = computed(() => ({
  isIOS: $q.platform?.is?.ios ?? false,
  isAndroid: $q.platform?.is?.android ?? false,
  isMobile: ($q.platform?.is?.ios ?? false) ||
    ($q.platform?.is?.android ?? false)
}));

const dcApiSystemAvailable = ref(false);

const {context, exchangeOptions} = useExchangeContext({
  platform,
  dcApiSystemAvailable
});

const isDebugMode = computed(() => {
  if(!context) {
    return false;
  }
  const ctx = context.value || context;
  return ctx?.options?.debug === true ||
    ctx?.workflow?.debug === true ||
    false;
});

const exchangeData = computed(() => {
  const ctx = context?.value || context;
  return ctx?.exchangeData || {};
});

const exchangeState = computed(() => {
  const ctx = context?.value || context;
  return ctx?.exchangeData?.state || 'pending';
});

const isActive = computed(() => {
  return exchangeState.value === 'active' && !interactionState.activeOverride;
});

const pickerEntries = computed(() => {
  if(!exchangeOptions.value) {
    return [];
  }
  return exchangeOptions.value.pickerEntries;
});

const activePickerEntry = computed(() => {
  if(interactionState.activePickerEntryOverride) {
    return interactionState.activePickerEntryOverride;
  }
  const entries = pickerEntries.value;
  return entries.length > 0 ? entries[0] : null;
});

const activeInteractionType = computed(() =>
  activePickerEntry.value?.method ?? null);

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

const checkDCApiAvailability = () => {
  if(navigator.credentials && window.DigitalCredential !== undefined) {
    dcApiSystemAvailable.value = true;
  } else {
    dcApiSystemAvailable.value = false;
  }
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
        emit('replaceExchange', updatedExchange);
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

const handlePickerSelect = entry => {
  if(typeof entry === 'object' && entry) {
    interactionState.activePickerEntryOverride = entry;
  } else if(typeof entry === 'string') {
    const match = pickerEntries.value.find(e => e.method === entry);
    if(match) {
      interactionState.activePickerEntryOverride = match;
    }
  }
  interactionState.activeOverride = true;
  interactionState.dcApiError = null;
};

const handleDcApiRetry = () => {
  interactionState.dcApiError = null;
  interactionState.activeOverride = true;
};

const handleSameDeviceLaunch = ({walletId, profile}) => {
  emit('launch', {walletId, profile});
};

const handleChapiActivate = () => {
  // CHAPI activation is handled by ChapiInteraction component
};

const handleChapiError = error => {
  console.error('CHAPI error:', error);
};

watch(activeInteractionType, value => {
  emit('update:activeInteractionType', value);
}, {immediate: true});

onMounted(() => {
  checkDCApiAvailability();
});

defineExpose({
  launchDcApi: handleDcApiLaunch,
  pickerEntries,
  activePickerEntry,
  handlePickerSelect
});
</script>
