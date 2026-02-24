<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div>
    <!-- Priority-based interaction display -->
    <DcApiInteraction
      v-if="activeInteractionType === 'dcapi'"
      :exchange-data="exchangeData"
      :exchange-state="exchangeState"
      :dc-api-state="interactionState.dcApiState"
      :error="interactionState.errors.dcApiError"
      @activate="handleDcApiActivate"
      @error-override="handleDcApiErrorOverride"
      @retry="handleDcApiRetry" />
    <QrCodeInteraction
      v-else-if="activeInteractionType === 'qr'"
      :qr-code-data-uri="qrCodeDataUri"
      :exchange-state="exchangeState"
      :exchange-data="exchangeData"
      :qr-state="interactionState.qrState"
      :active="active"
      @toggle-same-device="setPreferSameDevice"
      @go-back="qrDisplayOverrideOff" />
    <SameDeviceLinkInteraction
      v-else-if="activeInteractionType === 'samedevice'"
      :deep-link-url="protocolUrl"
      :exchange-state="exchangeState"
      :exchange-data="exchangeData"
      :same-device-state="interactionState.sameDeviceState"
      :protocol-type="protocolType"
      :active="active"
      @activate="handleSameDeviceActivate"
      @toggle-qr="setPreferQr" />
    <ChapiInteraction
      v-else-if="activeInteractionType === 'chapi'"
      :exchange-data="exchangeData"
      :exchange-state="exchangeState"
      :chapi-state="interactionState.chapiState"
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
wallet: {{selectedWallet}}
protocol: {{selectedProtocol}}
available protocols: {{availableProtocols}}
active: {{active}}
workflow: {{workflow}}
interaction state: {{interactionState}}
dcapi system available: {{dcApiSystemAvailable}}

exchange data:
{{exchangeData}}

workflow:
{{props.workflow}}
    </pre>
  </div>
</template>

<script setup>
import {computed, inject, onMounted, ref, watch} from 'vue';
import {
  generateWalletLink,
  getAvailableInteractionMethods
} from '../utils/wallets.js';
import ChapiInteraction from './interactions/ChapiInteraction.vue';
import DcApiInteraction from './interactions/DcApiInteraction.vue';

import {httpClient} from '@digitalbazaar/http-client';
import QRCode from 'qrcode';
import QrCodeInteraction from './interactions/QrCodeInteraction.vue';
import SameDeviceLinkInteraction from
  './interactions/SameDeviceLinkInteraction.vue';
import {startDCApiFlow as startDCApiFlowUtil} from '../utils/dcapi.js';
import {useQuasar} from 'quasar';

const props = defineProps({
  exchangeData: {
    type: Object,
    default: () => ({})
  },
  exchangeState: {
    type: String,
    default: 'pending'
  },
  selectedProtocol: {
    type: String,
    required: true
  },
  selectedWallet: {
    type: String,
    default: null
  },
  availableProtocols: {
    type: Array,
    default: () => []
  },
  active: {
    type: Boolean,
    default: false
  },
  workflow: {
    type: Object,
    required: true
  },
  walletsRegistry: {
    type: Object,
    required: true
  },
  protocolsRegistry: {
    type: Object,
    required: true
  },
  interactionState: {
    type: Object,
    required: true
  }
});

const emit = defineEmits([
  'updateInteractionState',
  'replaceExchange',
  'overrideActive'
]);

const $q = useQuasar();

// Get verification context (exchangeContext) to check debug mode
const verificationContext = inject('exchangeContext', null);

// Check if debug mode is enabled
const isDebugMode = computed(() => {
  if(!verificationContext) {
    return false;
  }
  const context = verificationContext.value || verificationContext;
  // Check for debug mode in options or workflow
  return context?.options?.debug === true ||
    context?.workflow?.debug === true ||
    false;
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
  const methods = getAvailableInteractionMethods({
    walletsRegistry: props.walletsRegistry,
    protocolsRegistry: props.protocolsRegistry,
    walletId: props.selectedWallet,
    protocolId: props.selectedProtocol,
    prefersSameDevice: props.interactionState.prefersSameDevice ?? false,
    isMobile: $q.platform.is.mobile,
    dcApiSystemAvailable: dcApiSystemAvailable.value,
    workflow: props.workflow,
    interactionState: props.interactionState,
    availableProtocols: props.availableProtocols
  });
  return methods[0] || null; // Return first available method
});

// Get the protocol URL for the selected protocol
const protocolUrl = computed(() => {
  // Determine the interaction method based on active interaction type
  // 'samedevice' maps to 'link', 'qr' maps to 'qr'
  const interactionMethod = activeInteractionType.value === 'samedevice' ?
    'link' : activeInteractionType.value === 'qr' ? 'qr' : null;

  // If we have a wallet selected and an interaction method, try to generate
  // wallet-specific URL
  if(props.selectedWallet && interactionMethod) {
    const walletUrl = generateWalletLink({
      exchange: props.exchangeData,
      walletId: props.selectedWallet,
      protocol: props.selectedProtocol,
      interactionMethod,
      workflow: props.workflow
    });
    if(walletUrl) {
      return walletUrl;
    }
  }

  // Fallback to default protocol URL
  if(!props.exchangeData?.protocols) {
    return props.exchangeData?.OID4VP || '';
  }
  // Use the selected protocol URL from the protocols object
  return props.exchangeData.protocols[props.selectedProtocol] ||
    props.exchangeData.OID4VP || '';
});

// Determine protocol type based on URL scheme
const protocolType = computed(() => {
  const url = protocolUrl.value;
  if(!url) {
    return null;
  }

  if(url.startsWith('openid4vp://')) {
    return 'openid4vp';
  }

  if(url.startsWith('http://') || url.startsWith('https://')) {
    // Check if wallet has a custom URL generator for this protocol
    // If it does, treat it as 'web' (deep link) instead of 'copy'
    const copyProtocols = ['interact', 'vcapi'];
    if(copyProtocols.includes(props.selectedProtocol)) {
      // Check if wallet has a custom getUrl function
      if(props.selectedWallet) {
        const wallet = props.walletsRegistry[props.selectedWallet];
        const protocolSupport = wallet?.supportedProtocols?.[
          props.selectedProtocol];
        if(protocolSupport) {
          // Check if either 'qr' or 'link' has a getUrl function
          const hasCustomUrl = (protocolSupport.qr &&
            typeof protocolSupport.qr === 'object' &&
            typeof protocolSupport.qr.getUrl === 'function') ||
            (protocolSupport.link &&
            typeof protocolSupport.link === 'object' &&
            typeof protocolSupport.link.getUrl === 'function');
          if(hasCustomUrl) {
            return 'web';
          }
        }
      }
      return 'copy';
    }
    return 'web';
  }

  return null;
});

// QR code for the selected protocol
const qrCodeDataUri = ref(props.exchangeData?.QR || '');

// Watch for protocol URL changes and update QR code
watch([protocolUrl, () => props.selectedProtocol], async () => {
  const qrProtocols = [
    'OID4VP',
    'OID4VP-draft18',
    'OID4VP-1.0',
    'OID4VP-combined',
    'interact',
    'vcapi'
  ];
  if(protocolUrl.value &&
    qrProtocols.includes(props.selectedProtocol)) {
    try {
      qrCodeDataUri.value = await QRCode.toDataURL(protocolUrl.value);
    } catch {
      qrCodeDataUri.value = props.exchangeData?.QR || '';
    }
  } else {
    qrCodeDataUri.value = props.exchangeData?.QR || '';
  }
}, {immediate: true});

// Handle DC API activation
const handleDcApiActivate = async () => {
  try {
    await startDCApiFlowUtil({
      exchangeData: props.exchangeData,
      httpClient,
      clientIdScheme: 'x509_san_dns',
      onExchangeUpdate: updatedExchange => {
        emit('replaceExchange', updatedExchange);
      },
      selectedProtocol: props.selectedProtocol
    });
  } catch(error) {
    console.error('DC API flow error:', error);
    emit('updateInteractionState', {
      errors: {
        dcApiError: {
          message: error.message ||
            'An error occurred while starting the DC API flow.'
        }
      }
    });
  }
};

// Handle DC API error override
const handleDcApiErrorOverride = () => {
  emit('updateInteractionState', {
    dcApiErrorOverride: true
  });
};

// Handle DC API retry
const handleDcApiRetry = () => {
  emit('updateInteractionState', {
    errors: {
      dcApiError: null
    }
  });
  handleDcApiActivate();
};

// Handle same device activation
const handleSameDeviceActivate = () => {
  // The SameDeviceLinkInteraction component handles the actual activation
  // TODO: This is just for tracking state if needed
};

// Set preference for same device interaction (from QR)
const setPreferSameDevice = () => {
  emit('updateInteractionState', {
    prefersSameDevice: true
  });
};

// Set preference for QR code interaction (from same device)
const setPreferQr = () => {
  emit('updateInteractionState', {
    prefersSameDevice: false
  });
};

// Handle go back (from QR when active)
const qrDisplayOverrideOff = () => {
  emit('updateInteractionState', {
    prefersSameDevice: false
  });
  emit('overrideActive');
};

// Handle CHAPI activation
const handleChapiActivate = () => {
  // CHAPI activation is handled by ChapiInteraction component
  // This is just for tracking if needed
};

// Handle CHAPI error
const handleChapiError = error => {
  emit('updateInteractionState', {
    errors: {
      chapiError: error
    }
  });
};

onMounted(() => {
  checkDCApiAvailability();
});
</script>
