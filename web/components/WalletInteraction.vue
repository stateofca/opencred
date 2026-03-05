<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div>
    <!-- Priority-based interaction display -->
    <DcApiInteraction
      v-if="activeInteractionType === 'dcapi'"
      :key="'dcapi'"
      :exchange-data="exchangeData"
      :error="interactionState.dcApiError"
      :active="isActive"
      :has-multiple-interaction-options="hasMultipleInteractionOptions"
      @launch="handleDcApiLaunch"
      @switch-interaction-method="handleSwitchInteractionMethod"
      @retry="handleDcApiRetry" />
    <QrAndLinkInteraction
      v-else-if="activeInteractionType === 'qr-and-link'"
      :exchange-data="exchangeData"
      :active="isActive"
      :deep-link-url="protocolUrl"
      :protocol-type="protocolType"
      :wallets-registry="walletsRegistry"
      :compatible-wallets="compatibleWalletsForActiveOption"
      :workflow="workflow"
      @launch="handleSameDeviceLaunch"
      @go-back="handleQrAndLinkGoBack" />
    <QrAndCopyInteraction
      v-else-if="activeInteractionType === 'qr-and-copy'"
      :exchange-data="exchangeData"
      :active="isActive"
      :wallets-registry="walletsRegistry"
      :compatible-wallets="compatibleWalletsForActiveOption"
      :workflow="workflow"
      @launch="handleSameDeviceLaunch"
      @go-back="handleQrAndCopyGoBack" />
    <ChapiInteraction
      v-else-if="activeInteractionType === 'chapi'"
      :exchange-data="exchangeData"
      :active="isActive"
      @activate="handleChapiActivate"
      @error="handleChapiError"
      @switch-interaction-method="handleSwitchInteractionMethod" />
    <div v-else>
      <p class="text-left text-sm mb-2 text-gray-900">
        No wallet interaction available. This may be a configuration error, or
        your current device may not support a connection method that supports
        any of the requested credential types.
      </p>
    </div>
    <div
      v-if="pickerAvailableOptions.length > 1">
      <div
        class="mt-4 mx-auto text-center">
        <cadmv-button
          no-caps
          variant="flat"
          :label="$t('otherOptions')"
          @click="showInteractionPicker = true" />
      </div>
      <InteractionPickerModal
        v-model="showInteractionPicker"
        :available-options="pickerAvailableOptions"
        :current-option="currentPickerOption"
        :current-interaction-type="activeInteractionType"
        :wallets-registry="walletsRegistry"
        @select="handlePickerSelect" />
    </div>
    <pre
      v-if="isDebugMode"
      class="text-left text-xs mb-2 text-gray-600">
active interaction type: {{activeInteractionType ?? 'null'}}
active picker option: {{activePickerOption}}
state: {{exchangeState}}
available protocols: {{availableProtocols}}
active: {{isActive}}
workflow: {{workflow}}
interaction state:
dcApiErrorOverride={{interactionState.dcApiErrorOverride}}
dcApiError={{interactionState.dcApiError}}
dcapi system available: {{dcApiSystemAvailable}}

enabled wallets: {{enabledWallets}}
wallets registry keys: {{Object.keys(walletsRegistry)}}
formats: {{extractCredentialFormats(workflow)}}
compatible wallets: {{compatibleWalletsDebug}}
available methods: {{availableMethodsDebug}}

exchange data:
{{exchangeData}}

workflow:
{{props.workflow}}
    </pre>
  </div>
</template>

<script setup>
import {
  buildExtendedRegistryForPicker,
  extractCredentialFormats,
  filterWalletsByFormatSupport,
  getPickerOptions,
  getProtocolInteractionMethods,
  WALLETS_REGISTRY
} from '../../common/wallets/index.js';
import {
  computed, inject, onMounted, reactive, ref, watch
} from 'vue';
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
import ChapiInteraction from './interactions/ChapiInteraction.vue';
import DcApiInteraction from './interactions/DcApiInteraction.vue';
import {httpClient} from '@digitalbazaar/http-client';
import InteractionPickerModal from './InteractionPickerModal.vue';
import QrAndCopyInteraction from './interactions/QrAndCopyInteraction.vue';
import QrAndLinkInteraction from './interactions/QrAndLinkInteraction.vue';
import {startDCApiFlow as startDCApiFlowUtil} from '../utils/dcapi.js';

const props = defineProps({
  availableProtocols: {
    type: Array,
    default: () => []
  },
  userSettings: {
    type: Object,
    default: () => ({enabledWallets: [], enabledProtocols: []})
  },
  workflow: {
    type: Object,
    required: true
  }
});

const emit = defineEmits([
  'replaceExchange',
  'launch',
  'update:activeInteractionType'
]);

// Local interaction state management
const interactionState = reactive({
  dcApiErrorOverride: false,
  dcApiError: null,
  activeOverride: false,
  // When set, takes precedence over computed default (option object)
  activePickerOptionOverride: null
});

// Get verification context (exchangeContext) to check debug mode
const context = inject('exchangeContext', null);

// Check if debug mode is enabled
const isDebugMode = computed(() => {
  if(!context) {
    return false;
  }
  const ctx = context.value || context;
  // Check for debug mode in options or workflow
  return ctx?.options?.debug === true ||
    ctx?.workflow?.debug === true ||
    false;
});

// Compute exchange data and state from context
const exchangeData = computed(() => {
  const ctx = context?.value || context;
  return ctx?.exchangeData || {};
});

const exchangeState = computed(() => {
  const ctx = context?.value || context;
  return ctx?.exchangeData?.state || 'pending';
});

// Compute active state from exchange state and activeOverride
const isActive = computed(() => {
  return exchangeState.value === 'active' && !interactionState.activeOverride;
});

// Compute base wallets registry and enabled wallets from context and
// userSettings
const baseWalletsRegistry = computed(() => {
  const ctx = context?.value || context;
  const wallets = ctx?.options?.wallets;
  const workflowWalletIds = wallets && Array.isArray(wallets) &&
    wallets.length > 0 ? wallets : Object.keys(WALLETS_REGISTRY);

  const settings = props.userSettings || {};
  const userEnabledIds = settings.enabledWallets;
  const enabledWalletIds = userEnabledIds && userEnabledIds.length > 0 ?
    workflowWalletIds.filter(id => userEnabledIds.includes(id)) :
    workflowWalletIds;

  const availableWallets = {};
  for(const walletId of enabledWalletIds) {
    if(WALLETS_REGISTRY[walletId]) {
      availableWallets[walletId] = WALLETS_REGISTRY[walletId];
    }
  }

  return availableWallets;
});

const baseEnabledWallets = computed(() => {
  return Object.keys(baseWalletsRegistry.value);
});

// Build extended registry with protocol wallets
const extendedRegistryData = computed(() => {
  const ctx = context?.value || context;
  const formats = extractCredentialFormats(props.workflow);
  return buildExtendedRegistryForPicker({
    enabledWallets: baseEnabledWallets.value,
    enabledProtocols: props.userSettings?.enabledProtocols || [],
    availableProtocols: props.availableProtocols,
    formats,
    registry: baseWalletsRegistry.value,
    OID4VPdefault: ctx?.options?.OID4VPdefault
  });
});

// Extended registry for child components
const walletsRegistry = computed(() => {
  return extendedRegistryData.value.extendedRegistry;
});

// Extended wallet IDs for getPickerOptions
const enabledWallets = computed(() => {
  return extendedRegistryData.value.extendedWalletIds;
});

// Check if DC API is available at system level
const dcApiSystemAvailable = ref(false);
const showInteractionPicker = ref(false);

// Check if DC API is available
const checkDCApiAvailability = () => {
  if(navigator.credentials && window.DigitalCredential !== undefined) {
    dcApiSystemAvailable.value = true;
  } else {
    dcApiSystemAvailable.value = false;
  }
};

// Options for interaction picker modal (from getPickerOptions)
const pickerAvailableOptions = computed(() => {
  const formats = extractCredentialFormats(props.workflow);
  return getPickerOptions({
    formats,
    exchange: exchangeData.value,
    availableProtocols: props.availableProtocols,
    enabledWallets: enabledWallets.value,
    dcApiSystemAvailable: dcApiSystemAvailable.value,
    dcApiErrorOverride: interactionState.dcApiErrorOverride,
    workflow: props.workflow,
    registry: walletsRegistry.value
  });
});

// Compute next option after current in picker list
const computeNextOption = currentOption => {
  const options = pickerAvailableOptions.value;
  if(!currentOption || options.length <= 1) {
    return null;
  }
  const idx = options.findIndex(o =>
    o.method === currentOption.method &&
    (o.protocolId || '') === (currentOption.protocolId || '') &&
    (o.walletId || '') === (currentOption.walletId || '')
  );
  if(idx === -1 || idx >= options.length - 1) {
    return options[0] ?? null;
  }
  return options[idx + 1] ?? null;
};

// Active picker option (override or first available)
const activePickerOption = computed(() => {
  if(interactionState.activePickerOptionOverride) {
    return interactionState.activePickerOptionOverride;
  }
  const options = pickerAvailableOptions.value;
  return options.length > 0 ? options[0] : null;
});

// Derived method for v-if routing (dcapi, qr-and-link, qr-and-copy, chapi)
const activeInteractionType = computed(() =>
  activePickerOption.value?.method ?? null);

// Current option for picker "Current" indicator
const currentPickerOption = computed(() => activePickerOption.value);

// Check if there are multiple interaction methods available
const hasMultipleInteractionOptions = computed(() => {
  return pickerAvailableOptions.value.length > 1;
});

// Debug computed properties
const compatibleWalletsDebug = computed(() => {
  const formats = extractCredentialFormats(props.workflow);
  if(formats.length === 0) {
    return [];
  }
  return filterWalletsByFormatSupport({
    walletIds: enabledWallets.value,
    formats,
    registry: walletsRegistry.value
  });
});

const availableMethodsDebug = computed(() => {
  const formats = extractCredentialFormats(props.workflow);
  if(formats.length === 0) {
    return [];
  }

  const compatibleWallets = filterWalletsByFormatSupport({
    walletIds: enabledWallets.value,
    formats,
    registry: walletsRegistry.value
  });

  if(compatibleWallets.length === 0) {
    return [];
  }

  const oid4vpProtocols = [
    'OID4VP-draft18', 'OID4VP-1.0', 'OID4VP-combined',
    'OID4VP', 'OID4VP-haip-1.0', '18013-7-Annex-B'
  ];
  const availableMethods = new Set();

  for(const walletId of compatibleWallets) {
    for(const format of formats) {
      const combinations = getProtocolInteractionMethods({
        walletId,
        format,
        exchange: exchangeData.value,
        registry: walletsRegistry.value
      });

      for(const combo of combinations) {
        const method = combo.interactionMethod;
        const protocolId = combo.protocolId;

        if(method === 'dcapi') {
          if(dcApiSystemAvailable.value &&
            props.workflow?.dcApiEnabled !== false &&
            !['chapi', 'vcapi', 'interact'].includes(protocolId) &&
            (format === 'mso_mdoc' ||
              protocolId === '18013-7-Annex-D' ||
              protocolId === 'OID4VP-HAIP-1.0') &&
            !interactionState.dcApiErrorOverride) {
            availableMethods.add('dcapi');
          }
        }

        if(oid4vpProtocols.includes(protocolId) &&
          (method === 'qr' || method === 'link')) {
          availableMethods.add('qr-and-link');
        }

        if(protocolId === 'interact' &&
          (method === 'qr' || method === 'copy')) {
          availableMethods.add('qr-and-copy');
        }

        if(method === 'chapi' || protocolId === 'chapi') {
          availableMethods.add('chapi');
        }
      }
    }
  }

  return Array.from(availableMethods);
});

// Protocol URL fallback (QrAndLinkInteraction computes
// wallet-specific URLs)
const protocolUrl = computed(() => {
  const option = activePickerOption.value;
  if(option?.protocolId && exchangeData.value?.protocols?.[option.protocolId]) {
    return exchangeData.value.protocols[option.protocolId];
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

// Determine protocol type based on URL scheme (fallback only)
const protocolType = computed(() => {
  const url = protocolUrl.value;
  if(!url) {
    return null;
  }

  if(url.startsWith('openid4vp://')) {
    return 'openid4vp';
  }

  if(url.startsWith('http://') || url.startsWith('https://')) {
    return 'web';
  }

  return null;
});

// Base compatible wallets for qr-and-link (OID4VP + vcapi)
const qrAndLinkCompatibleWalletsBase = computed(() => {
  const formats = extractCredentialFormats(props.workflow);
  const compatibleWallets = filterWalletsByFormatSupport({
    walletIds: enabledWallets.value,
    formats,
    registry: walletsRegistry.value
  });
  const oid4vpProtocols = [
    'OID4VP-draft18', 'OID4VP-1.0', 'OID4VP-combined',
    'OID4VP', 'OID4VP-haip-1.0', '18013-7-Annex-B'
  ];
  const result = [];
  const seen = new Set();
  for(const walletId of compatibleWallets) {
    for(const format of formats) {
      const combinations = getProtocolInteractionMethods({
        walletId,
        format,
        exchange: exchangeData.value,
        registry: walletsRegistry.value
      });
      const match = combinations.find(c =>
        (oid4vpProtocols.includes(c.protocolId) || c.protocolId === 'vcapi') &&
        (c.interactionMethod === 'qr' || c.interactionMethod === 'link' ||
          c.interactionMethod === 'copy')
      );
      if(match && !seen.has(walletId)) {
        result.push({walletId, protocolId: match.protocolId});
        seen.add(walletId);
        break;
      }
    }
  }
  return result;
});

// Base compatible wallets for qr-and-copy (interact)
const qrAndCopyCompatibleWalletsBase = computed(() => {
  const formats = extractCredentialFormats(props.workflow);
  const compatibleWallets = filterWalletsByFormatSupport({
    walletIds: enabledWallets.value,
    formats,
    registry: walletsRegistry.value
  });
  const result = [];
  const seen = new Set();
  for(const walletId of compatibleWallets) {
    for(const format of formats) {
      const combinations = getProtocolInteractionMethods({
        walletId,
        format,
        exchange: exchangeData.value,
        registry: walletsRegistry.value
      });
      const match = combinations.find(c =>
        c.protocolId === 'interact' &&
        (c.interactionMethod === 'qr' || c.interactionMethod === 'copy')
      );
      if(match && !seen.has(walletId)) {
        result.push({walletId, protocolId: match.protocolId});
        seen.add(walletId);
        break;
      }
    }
  }
  return result;
});

// Filtered compatible wallets for the active picker option
const compatibleWalletsForActiveOption = computed(() => {
  const option = activePickerOption.value;
  if(!option) {
    return [];
  }
  if(option.method === 'qr-and-link') {
    const base = qrAndLinkCompatibleWalletsBase.value;
    return base.filter(({walletId, protocolId}) => {
      if(option.protocolId && protocolId !== option.protocolId) {
        return false;
      }
      if(option.walletId && walletId !== option.walletId) {
        return false;
      }
      return true;
    });
  }
  if(option.method === 'qr-and-copy') {
    return qrAndCopyCompatibleWalletsBase.value;
  }
  return [];
});

// Handle DC API launch
const handleDcApiLaunch = async ({protocolId}) => {
  if(!protocolId) {
    throw new Error('Protocol ID is required');
  }
  try {
    await startDCApiFlowUtil({
      exchangeData: exchangeData.value,
      httpClient,
      clientIdScheme: 'x509_san_dns',
      onExchangeUpdate: updatedExchange => {
        emit('replaceExchange', updatedExchange);
      },
      selectedProtocol: protocolId
    });
  } catch(error) {
    console.error('DC API flow error:', error);
    interactionState.dcApiError = {
      message: error.message ||
        'An error occurred while starting the DC API flow.'
    };
  }
};

// Handle switchInteractionMethod from child components
// method: explicit method to switch to, or null to compute next option
const handleSwitchInteractionMethod = (method = null) => {
  let nextOption = null;
  if(method) {
    nextOption = pickerAvailableOptions.value.find(o => o.method === method) ||
      null;
  } else {
    nextOption = computeNextOption(activePickerOption.value);
  }
  if(nextOption) {
    interactionState.activePickerOptionOverride = nextOption;
  }
  if(activeInteractionType.value === 'dcapi') {
    interactionState.dcApiErrorOverride = true;
    interactionState.dcApiError = null;
  }
  interactionState.activeOverride = true;
};

// Handle picker selection
const handlePickerSelect = option => {
  if(typeof option === 'object' && option) {
    interactionState.activePickerOptionOverride = option;
  } else if(typeof option === 'string') {
    const match = pickerAvailableOptions.value.find(o => o.method === option);
    if(match) {
      interactionState.activePickerOptionOverride = match;
    }
  }
  // Protocol switch: treat as pending so target interaction shows enabled UI
  interactionState.activeOverride = true;
  if(activeInteractionType.value === 'dcapi') {
    interactionState.dcApiErrorOverride = true;
    interactionState.dcApiError = null;
  }
  showInteractionPicker.value = false;
};

// Handle DC API retry
const handleDcApiRetry = () => {
  // Clear error and enable buttons for retry
  // Setting activeOverride to true makes isActive false, enabling the buttons
  interactionState.dcApiError = null;
  interactionState.activeOverride = true;
};

const handleSameDeviceLaunch = ({walletId, protocolId}) => {
  emit('launch', {walletId, protocolId});
};

const handleQrAndLinkGoBack = () => {
  interactionState.activeOverride = true;
};

const handleQrAndCopyGoBack = () => {
  interactionState.activeOverride = true;
};

// Handle CHAPI activation
const handleChapiActivate = () => {
  // CHAPI activation is handled by ChapiInteraction component
  // This is just for tracking if needed
};

// Handle CHAPI error
const handleChapiError = error => {
  // CHAPI errors are currently not displayed, but kept for potential future use
  console.error('CHAPI error:', error);
};

watch(activeInteractionType, value => {
  emit('update:activeInteractionType', value);
}, {immediate: true});

onMounted(() => {
  checkDCApiAvailability();
});

defineExpose({
  launchDcApi: handleDcApiLaunch
});
</script>
