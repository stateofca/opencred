<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div>
    <OpenCredExchange
      v-if="context.exchangeData?.state !== 'complete'"
      purpose="login" />
    <div
      v-else
      class="bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
             px-16 lg:px-24 relative">
      <div class="mx-auto py-24 flex items-center justify-center gap-5 text-xl">
        <q-icon
          name="fas fa-circle-check"
          size="60px"
          color="green" />
        {{$t('verificationSuccess')}}
      </div>
    </div>
  </div>
</template>

<script setup>
import {onBeforeMount, provide, ref, watch} from 'vue';
import {config} from '@bedrock/web';
import {httpClient} from '@digitalbazaar/http-client';
import OpenCredExchange from '../components/OpenCredExchange.vue';
import {QIcon} from 'quasar';
import {setCssVar} from 'quasar';

// Context for exchange - will be fetched
const context = ref({
  workflow: {
    brand: config.brand || {}
  },
  options: config.opencred?.options || {},
  exchangeData: null
});

// Fetch context from /context/login endpoint
onBeforeMount(async () => {
  try {
    const resp = await httpClient.get(
      `/context/login${window.location.search}`
    );
    context.value = resp.data;
    if(resp.data.workflow.brand) {
      Object.keys(resp.data.workflow.brand).forEach(key => {
        setCssVar(key, resp.data.workflow.brand[key]);
      });
      // Set --q-primary to header color for CadmvHeader component
      if(resp.data.workflow.brand.header) {
        setCssVar('primary', resp.data.workflow.brand.header);
      }
    }
  } catch(e) {
    // Use config default on error
    console.error('Failed to fetch context:', e);
  }
});

// Provide context to child components (OpenCredExchange)
provide('exchangeContext', context);

// Watch for exchange completion and redirect
watch(
  () => context.value.exchangeData?.state,
  newState => {
    if(newState === 'complete') {
      const queryParams = new URLSearchParams({
        state: context.value.exchangeData.oidc.state,
        code: context.value.exchangeData.oidc.code
      });
      const destination = `${context.value.workflow.redirectUri}?${
        queryParams.toString()}`;
      window.location.href = destination;
    }
  },
  {immediate: true}
);

</script>
