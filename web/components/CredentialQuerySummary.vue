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
        {{$t('credentialRequestSummary')}}
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
import {useI18n} from 'vue-i18n';

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

const {t} = useI18n({useScope: 'global'});

/**
 * Get human-readable name for a credential type
 * @param {string} type - The credential type identifier
 * @returns {string} - Human-readable name or original type if no mapping exists
 */
const getHumanReadableName = type => {
  if(!type) {
    return type;
  }
  // Try to get translation with creds namespace, fall back to original type
  const translationKey = `creds.${type}`;
  const translated = t(translationKey);
  // If translation returns the key itself (no translation found),
  // return original
  return translated !== translationKey ? translated : type;
};

// Extract credential types from rp.query or rp.dcql_query
const credentialTypes = computed(() => {
  const types = [];

  // Check for simplified query format
  if(props.rp?.query && Array.isArray(props.rp.query)) {
    for(const q of props.rp.query) {
      // Handle mso_mdoc format queries with fields
      if(q.format && Array.isArray(q.format) && q.format.includes('mso_mdoc')) {
        if(q.fields && typeof q.fields === 'object') {
          // Check for org.iso.18013.5.1 namespace
          if(q.fields['org.iso.18013.5.1']) {
            types.push('org.iso.18013.5.1');
          }
        }
      }
      // Handle type-based queries (prioritize type when available)
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

  // Remove duplicates and apply human-readable names
  const uniqueTypes = [...new Set(types)];
  return uniqueTypes.map(type => getHumanReadableName(type));
});
</script>

