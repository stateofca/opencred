<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div
    v-if="credentialTypes.length > 0"
    class="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50"
    style="max-height: 200px; overflow-y: auto;">
    <div class="text-sm text-gray-700">
      <p class="font-semibold mb-2 text-gray-900">
        {{$t('credentialRequestSummary') || 'Requested Credentials'}}
      </p>
      <ul class="list-disc list-inside space-y-1">
        <li
          v-for="(credType, index) in credentialTypes"
          :key="index">
          {{credType}}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import {computed} from 'vue';

const props = defineProps({
  rp: {
    type: Object,
    required: true
  },
  exchangeData: {
    type: Object,
    default: () => ({})
  }
});

// Extract credential types from rp.query or rp.dcql_query
const credentialTypes = computed(() => {
  const types = [];

  // Check for DCQL query format
  if(props.rp?.dcql_query?.credentials &&
    Array.isArray(props.rp.dcql_query.credentials)) {
    for(const cred of props.rp.dcql_query.credentials) {
      // Try to get friendly name from meta.type_values or use id
      if(cred.meta?.type_values && Array.isArray(cred.meta.type_values)) {
        // Filter out VerifiableCredential and use the first meaningful type
        const meaningfulTypes = cred.meta.type_values.filter(
          t => t !== 'VerifiableCredential'
        );
        if(meaningfulTypes.length > 0) {
          types.push(meaningfulTypes[0]);
        } else if(cred.id) {
          types.push(cred.id);
        }
      } else if(cred.id) {
        types.push(cred.id);
      }
    }
  }

  // Check for legacy query format
  if(types.length === 0 && props.rp?.query && Array.isArray(props.rp.query)) {
    for(const q of props.rp.query) {
      if(q.type && Array.isArray(q.type)) {
        // Filter out VerifiableCredential and use meaningful types
        const meaningfulTypes = q.type.filter(
          t => t !== 'VerifiableCredential'
        );
        if(meaningfulTypes.length > 0) {
          types.push(...meaningfulTypes);
        } else {
          types.push(...q.type);
        }
      }
    }
  }

  // Remove duplicates
  return [...new Set(types)];
});
</script>

