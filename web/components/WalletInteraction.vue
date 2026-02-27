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
      :exchange-data="exchangeData"
      :error="interactionState.dcApiError"
      :active="isActive"
      :wallets-registry="walletsRegistry"
      :available-protocols="availableProtocols"
      :workflow="workflow"
      :enabled-wallets="enabledWallets"
      @activate="handleDcApiActivate"
      @launch="handleDcApiLaunch"
      @error-override="handleDcApiErrorOverride"
      @retry="handleDcApiRetry" />
    <QrCodeInteraction
      v-else-if="activeInteractionType === 'qr'"
      :exchange-data="exchangeData"
      :active="isActive"
      :wallets-registry="walletsRegistry"
      :compatible-wallets="qrCompatibleWallets"
      :workflow="workflow"
      @toggle-same-device="setPreferSameDevice"
      @go-back="qrDisplayOverrideOff" />
    <SameDeviceLinkInteraction
      v-else-if="activeInteractionType === 'link' &&
        interactionState.prefersSameDevice"
      :deep-link-url="protocolUrl"
      :exchange-data="exchangeData"
      :protocol-type="protocolType"
      :active="isActive"
      :wallets-registry="walletsRegistry"
      :compatible-wallets="sameDeviceCompatibleWallets"
      :workflow="workflow"
      @toggle-qr="setPreferQr"
      @launch="handleSameDeviceLaunch" />
    <ChapiInteraction
      v-else-if="activeInteractionType === 'chapi'"
      :exchange-data="exchangeData"
      :active="isActive"
      @activate="handleChapiActivate"
      @error="handleChapiError" />
    <div v-else>
      <p class="text-left text-sm mb-2 text-gray-900">
        No wallet interaction available.
      </p>
    </div>
    <pre
      v-if="isDebugMode"
      class="text-left text-xs mb-2 text-gray-600">
active interaction type: {{activeInteractionType ?? 'null'}}
state: {{exchangeState}}
available protocols: {{availableProtocols}}
active: {{isActive}}
workflow: {{workflow}}
interaction state:
prefersSameDevice={{interactionState.prefersSameDevice}}
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
  computed, inject, onBeforeMount, onMounted, reactive, ref, watch
} from 'vue';
import {
  extractCredentialFormats,
  filterWalletsByFormatSupport,
  getProtocolInteractionMethods,
  INTERACTION_METHOD_PRIORITY,
  WALLETS_REGISTRY
} from '../../common/wallets/index.js';
import ChapiInteraction from './interactions/ChapiInteraction.vue';
import DcApiInteraction from './interactions/DcApiInteraction.vue';
import {httpClient} from '@digitalbazaar/http-client';
import QrCodeInteraction from './interactions/QrCodeInteraction.vue';
import SameDeviceLinkInteraction from
  './interactions/SameDeviceLinkInteraction.vue';
import {startDCApiFlow as startDCApiFlowUtil} from '../utils/dcapi.js';
import {useQuasar} from 'quasar';

const props = defineProps({
  availableProtocols: {
    type: Array,
    default: () => []
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

const $q = useQuasar();

// Local interaction state management
const interactionState = reactive({
  prefersSameDevice: false,
  dcApiErrorOverride: false,
  dcApiError: null,
  activeOverride: false
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

// Compute wallets registry and enabled wallets from context
const walletsRegistry = computed(() => {
  const ctx = context?.value || context;
  // Get enabled wallets from options, defaulting to all available wallets
  const wallets = ctx?.options?.wallets;
  const enabledWalletIds = wallets && Array.isArray(wallets) &&
    wallets.length > 0 ? wallets : Object.keys(WALLETS_REGISTRY);

  // Filter wallets registry to only include enabled wallets
  const availableWallets = {};
  for(const walletId of enabledWalletIds) {
    if(WALLETS_REGISTRY[walletId]) {
      availableWallets[walletId] = WALLETS_REGISTRY[walletId];
    }
  }

  return availableWallets;
});

const enabledWallets = computed(() => {
  return Object.keys(walletsRegistry.value);
});

// Check if DC API is available at system level
const dcApiSystemAvailable = ref(false);

// Check if DC API is available
const checkDCApiAvailability = () => {
  if(navigator.credentials && window.DigitalCredential !== undefined) {
    dcApiSystemAvailable.value = true;
  } else {
    dcApiSystemAvailable.value = false;
  }
};

// Determine which interaction type to show based on priority
const activeInteractionType = computed(() => {
  // Extract credential formats from workflow
  const formats = extractCredentialFormats(props.workflow);
  if(formats.length === 0) {
    return null;
  }

  // Filter wallets by format support
  const compatibleWallets = filterWalletsByFormatSupport({
    walletIds: enabledWallets.value,
    formats,
    registry: walletsRegistry.value
  });

  if(compatibleWallets.length === 0) {
    return null;
  }

  const prefersSameDevice = interactionState.prefersSameDevice;
  const availableMethods = new Set();

  // Check all compatible wallets for available interaction methods
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

        // 1. DC API (highest priority) - check conditions
        if(method === 'dcapi') {
          if(dcApiSystemAvailable.value &&
            props.workflow?.dcApiEnabled !== false &&
            !['chapi', 'vcapi', 'interact'].includes(combo.protocolId) &&
            (format === 'mso_mdoc' ||
              combo.protocolId === '18013-7-Annex-D' ||
              combo.protocolId === 'OID4VP-HAIP-1.0') &&
            !interactionState.dcApiErrorOverride) {
            availableMethods.add('dcapi');
          }
        }

        // 2. QR (if not prefersSameDevice)
        if(method === 'qr' && !prefersSameDevice) {
          availableMethods.add('qr');
        }

        // 3. Link (if prefersSameDevice) - includes copy-only wallets
        if((method === 'link' || method === 'copy') && prefersSameDevice) {
          availableMethods.add('link');
        }

        // 4. CHAPI
        if(method === 'chapi' || combo.protocolId === 'chapi') {
          availableMethods.add('chapi');
        }
      }
    }
  }

  // Sort by priority and return first
  const methods = Array.from(availableMethods);
  if(methods.length === 0) {
    return null;
  }

  methods.sort((a, b) => {
    const aPriority = INTERACTION_METHOD_PRIORITY.indexOf(a);
    const bPriority = INTERACTION_METHOD_PRIORITY.indexOf(b);
    const aPrio = aPriority === -1 ? Infinity : aPriority;
    const bPrio = bPriority === -1 ? Infinity : bPriority;
    return aPrio - bPrio;
  });

  return methods[0];
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

  const prefersSameDevice = interactionState.prefersSameDevice;
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

        if(method === 'dcapi') {
          if(dcApiSystemAvailable.value &&
            props.workflow?.dcApiEnabled !== false &&
            !['chapi', 'vcapi', 'interact'].includes(combo.protocolId) &&
            (format === 'mso_mdoc' ||
              combo.protocolId === '18013-7-Annex-D' ||
              combo.protocolId === 'OID4VP-HAIP-1.0') &&
            !interactionState.dcApiErrorOverride) {
            availableMethods.add('dcapi');
          }
        }

        if(method === 'qr' && !prefersSameDevice) {
          availableMethods.add('qr');
        }

        if((method === 'link' || method === 'copy') && prefersSameDevice) {
          availableMethods.add('link');
        }

        if(method === 'chapi' || combo.protocolId === 'chapi') {
          availableMethods.add('chapi');
        }
      }
    }
  }

  return Array.from(availableMethods);
});

// Get the protocol URL as fallback (SameDeviceLinkInteraction computes
// wallet-specific URLs)
const protocolUrl = computed(() => {
  // Fallback to default protocol URL
  if(!exchangeData.value?.protocols) {
    return exchangeData.value?.OID4VP || '';
  }
  // Return first available protocol URL as fallback
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

// Compute QR-compatible wallets for QR interaction
const qrCompatibleWallets = computed(() => {
  // Only compute if QR interaction is active
  if(activeInteractionType.value !== 'qr') {
    return [];
  }

  // Extract credential formats from workflow
  const formats = extractCredentialFormats(props.workflow);
  if(formats.length === 0) {
    return [];
  }

  // Filter wallets by format support
  const compatibleWallets = filterWalletsByFormatSupport({
    walletIds: enabledWallets.value,
    formats,
    registry: walletsRegistry.value
  });

  // Find all wallets that support QR for ANY protocol
  const qrCompatible = [];
  const seenWallets = new Set();

  for(const walletId of compatibleWallets) {
    // Skip if we've already added this wallet
    if(seenWallets.has(walletId)) {
      continue;
    }

    // Check if wallet supports QR for any protocol
    for(const format of formats) {
      const combinations = getProtocolInteractionMethods({
        walletId,
        format,
        exchange: exchangeData.value,
        registry: walletsRegistry.value
      });

      // Find first QR combination for this wallet
      const qrCombo = combinations.find(c => c.interactionMethod === 'qr');

      if(qrCombo) {
        qrCompatible.push({
          walletId,
          protocolId: qrCombo.protocolId
        });
        seenWallets.add(walletId);
        break; // Found one, move to next wallet
      }
    }
  }

  return qrCompatible;
});

// Compute same-device link compatible wallets
const sameDeviceCompatibleWallets = computed(() => {
  // Only compute if same-device interaction is active
  if(activeInteractionType.value !== 'link' ||
    !interactionState.prefersSameDevice) {
    return [];
  }

  // Extract credential formats from workflow
  const formats = extractCredentialFormats(props.workflow);
  if(formats.length === 0) {
    return [];
  }

  // Filter wallets by format support
  const compatibleWallets = filterWalletsByFormatSupport({
    walletIds: enabledWallets.value,
    formats,
    registry: walletsRegistry.value
  });

  // Find all wallets that support link or copy for same-device
  const sameDeviceWallets = [];
  const seenWallets = new Set();

  for(const walletId of compatibleWallets) {
    if(seenWallets.has(walletId)) {
      continue;
    }

    let supportsLink = false;
    let supportsCopy = false;
    let protocolId = null;

    for(const format of formats) {
      const combinations = getProtocolInteractionMethods({
        walletId,
        format,
        exchange: exchangeData.value,
        registry: walletsRegistry.value
      });

      const linkCombo = combinations.find(c => c.interactionMethod === 'link');
      const copyCombo = combinations.find(c => c.interactionMethod === 'copy');

      if(linkCombo) {
        supportsLink = true;
        protocolId = protocolId || linkCombo.protocolId;
      }
      if(copyCombo) {
        supportsCopy = true;
        protocolId = protocolId || copyCombo.protocolId;
      }
    }

    if(supportsLink || supportsCopy) {
      sameDeviceWallets.push({
        walletId,
        protocolId,
        supportsLink,
        supportsCopy
      });
      seenWallets.add(walletId);
    }
  }

  return sameDeviceWallets;
});

// Handle DC API activation
const handleDcApiActivate = async (protocolId = null) => {
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

// Handle DC API error override
const handleDcApiErrorOverride = () => {
  // Clear error state so wallet selection screen is shown
  interactionState.dcApiErrorOverride = true;
  interactionState.dcApiError = null;
  // Set activeOverride to prevent spinner when switching from DC API to QR
  interactionState.activeOverride = true;
};

// Handle DC API retry
const handleDcApiRetry = () => {
  // Extract credential formats from workflow
  const formats = extractCredentialFormats(props.workflow);

  // Filter wallets by format support
  const compatibleWallets = filterWalletsByFormatSupport({
    walletIds: enabledWallets.value,
    formats,
    registry: walletsRegistry.value
  });

  // Filter for wallets that support DC API for available protocols
  const dcApiCompatibleWallets = [];
  for(const walletId of compatibleWallets) {
    // Check if wallet supports DC API for any available protocol
    for(const protocolId of props.availableProtocols) {
      // Skip protocols that don't support DC API
      if(['chapi', 'vcapi', 'interact'].includes(protocolId)) {
        continue;
      }

      // Check if wallet supports DC API for this protocol with mso_mdoc format
      const combinations = getProtocolInteractionMethods({
        walletId,
        format: 'mso_mdoc',
        exchange: exchangeData.value,
        registry: walletsRegistry.value
      });

      const hasDcApi = combinations.some(c =>
        c.protocolId === protocolId && c.interactionMethod === 'dcapi'
      );

      if(hasDcApi) {
        dcApiCompatibleWallets.push({walletId, protocolId});
        break; // Found one protocol, move to next wallet
      }
    }
  }

  // Clear error
  interactionState.dcApiError = null;

  // If only one wallet, retry immediately with its protocol
  if(dcApiCompatibleWallets.length === 1) {
    handleDcApiActivate(dcApiCompatibleWallets[0].protocolId);
  }
  // Multiple wallets: user can choose again from wallet buttons
};

// Handle DC API launch (from wallet button) - launch directly
const handleDcApiLaunch = ({protocolId}) => {
  // Launch DC API with the selected protocol
  handleDcApiActivate(protocolId);
};

// Handle same device wallet launch
const handleSameDeviceLaunch = ({walletId, protocolId}) => {
  emit('launch', {walletId, protocolId});
};

// Set preference for same device interaction (from QR)
const setPreferSameDevice = () => {
  interactionState.prefersSameDevice = true;
};

// Set preference for QR code interaction (from same device)
const setPreferQr = () => {
  interactionState.prefersSameDevice = false;
};

// Handle go back (from QR when active)
const qrDisplayOverrideOff = () => {
  interactionState.prefersSameDevice = false;
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

onBeforeMount(() => {
  // Initialize prefersSameDevice based on mobile detection
  if($q.platform.is.mobile) {
    interactionState.prefersSameDevice = true;
  }
});

onMounted(() => {
  checkDCApiAvailability();
});

defineExpose({
  launchDcApi: handleDcApiActivate
});
</script>
