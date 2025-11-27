<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div>
    <div v-if="exchangeState === 'complete'">
      <!-- Completion handled by parent -->
    </div>
    <div
      v-else-if="error"
      class="flex justify-center pt-8">
      <ErrorView
        :title="error.title"
        :message="error.message"
        :resettable="error.resettable"
        @reset="$emit('reset')" />
    </div>
    <div v-else>
      <CHAPIView
        v-if="selectedProtocol === 'chapi'"
        :chapi-enabled="true"
        :rp="rp"
        :options="options"
        :exchange-data="exchangeData"
        :selected-protocol="selectedProtocol"
        @select-protocol="handleSelectProtocol" />
      <OID4VPView
        v-else-if="isOID4VPProtocol(selectedProtocol) ||
          isQrAndCopyUrlProtocol(selectedProtocol)"
        :brand="brand"
        :exchange-data="exchangeDataWithQR"
        :options="options"
        :explainer-video="explainerVideo"
        :active="active"
        :selected-protocol="selectedProtocol"
        :selected-wallet="selectedWallet"
        :available-protocols="availableProtocols"
        :wallets-registry="walletsRegistry"
        :protocols-registry="protocolsRegistry"
        :prefers-qr-display="prefersQrDisplay"
        :is-copy-url-protocol="isQrAndCopyUrlProtocol(selectedProtocol)"
        :dc-api-enabled="rp?.dcApiEnabled ?? false"
        @select-protocol="handleSelectProtocol" />
    </div>
  </div>
</template>

<script setup>
import {computed, ref, watch} from 'vue';
import CHAPIView from './CHAPIView.vue';
import ErrorView from './ErrorView.vue';
import OID4VPView from './OID4VPView.vue';
import QRCode from 'qrcode';

const props = defineProps({
  exchangeData: {
    type: Object,
    default: () => ({})
  },
  exchangeState: {
    type: String,
    default: 'pending'
  },
  error: {
    type: Object,
    default: null
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
  brand: {
    type: Object,
    required: true
  },
  options: {
    type: Object,
    required: true
  },
  explainerVideo: {
    type: Object,
    default: () => ({
      id: '',
      provider: ''
    })
  },
  active: {
    type: Boolean,
    default: false
  },
  rp: {
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
  prefersQrDisplay: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['selectProtocol', 'reset']);

// Get the protocol URL for the selected protocol
const protocolUrl = computed(() => {
  if(!props.exchangeData?.protocols) {
    return props.exchangeData?.OID4VP || '';
  }
  // Use the selected protocol URL from the protocols object
  return props.exchangeData.protocols[props.selectedProtocol] ||
    props.exchangeData.OID4VP || '';
});

const isOID4VPProtocol = protocol => {
  return protocol === 'OID4VP' || protocol === 'OID4VP-draft18' ||
    protocol === 'OID4VP-1.0' || protocol === 'OID4VP-combined';
};

const isQrAndCopyUrlProtocol = protocol => {
  return protocol === 'interact' || protocol === 'vcapi';
};

// QR code for the selected protocol
const qrCode = ref(props.exchangeData?.QR || '');

// Watch for protocol URL changes and update QR code
watch([protocolUrl, () => props.selectedProtocol], async () => {
  if(protocolUrl.value &&
    (isOID4VPProtocol(props.selectedProtocol) ||
      isQrAndCopyUrlProtocol(props.selectedProtocol))) {
    try {
      qrCode.value = await QRCode.toDataURL(protocolUrl.value);
    } catch{
      qrCode.value = props.exchangeData?.QR || '';
    }
  } else {
    qrCode.value = props.exchangeData?.QR || '';
  }
}, {immediate: true});

// Exchange data with the correct protocol URL and QR code
const exchangeDataWithQR = computed(() => {
  const data = {...props.exchangeData};
  // Update OID4VP to use the selected protocol URL if available
  if(protocolUrl.value &&
    (isOID4VPProtocol(props.selectedProtocol) ||
      isQrAndCopyUrlProtocol(props.selectedProtocol))) {
    data.OID4VP = protocolUrl.value;
    // Update QR code to use the generated one for the selected protocol
    if(qrCode.value) {
      data.QR = qrCode.value;
    }
  }
  return data;
});

const handleSelectProtocol = event => {
  emit('selectProtocol', event);
};
</script>
