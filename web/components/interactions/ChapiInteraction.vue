<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="flex flex-col items-center justify-center">
    <cadmv-button
      variant="primary"
      :loading="active"
      :disabled="active"
      @click="handleActivate">
      {{$t('appCta-chapi-label')}}
    </cadmv-button>
  </div>
</template>

<script setup>
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
import {getCredentials} from '../../chapi.js';

const props = defineProps({
  exchangeData: {
    type: Object,
    required: true
  },
  active: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['activate', 'error']);

const handleActivate = async () => {
  try {
    // Get the protocol URL for OID4VP
    const protocolUrl = props.exchangeData?.protocols?.[
      Object.keys(props.exchangeData.protocols || {})[0]
    ] || props.exchangeData?.OID4VP || '';

    const req = await getCredentials({
      queries: {},
      protocols: {
        OID4VP: protocolUrl
      }
    });
    if(req.dataType === 'OutOfBand') {
      // Exchange will become active, state managed by parent
      emit('activate');
    }
  } catch(error) {
    console.error('CHAPI flow error:', error);
    emit('error', {
      message: error.message ||
        'An error occurred while starting the CHAPI flow.'
    });
  }
};
</script>

