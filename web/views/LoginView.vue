<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

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
      <div
        class="mx-auto py-24 flex flex-col items-center justify-center
             gap-5 text-xl">
        <div class="flex items-center justify-center gap-5">
          <q-icon
            name="fas fa-circle-check"
            size="60px"
            color="green" />
          {{$t('verificationSuccess')}}
        </div>
        <cadmv-button
          v-if="context.autoRedirectToClient === false &&
            context.exchangeData?.oidc?.code &&
            context.workflow?.redirectUri"
          variant="primary"
          @click="continueToClient">
          {{$t('continueToClient', {
            name: context.workflow.name || 'client'
          })}}
        </cadmv-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import {onBeforeMount, provide, ref, watch} from 'vue';
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
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

// Fetch context from /context/login or /context/continue when exchange_token
onBeforeMount(async () => {
  try {
    const exchangeToken = new URLSearchParams(window.location.search)
      .get('exchange_token');
    const url = exchangeToken ?
      `/context/continue?exchange_token=${encodeURIComponent(exchangeToken)}` :
      `/context/login${window.location.search}`;
    const resp = await httpClient.get(url);
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

// Navigate to client redirect URI with code and state
const continueToClient = () => {
  const {exchangeData, workflow} = context.value;
  if(!exchangeData?.oidc?.code || !workflow?.redirectUri) {
    return;
  }
  const queryParams = new URLSearchParams({
    state: exchangeData.oidc.state,
    code: exchangeData.oidc.code
  });
  window.location.href = `${workflow.redirectUri}?${queryParams.toString()}`;
};

// Watch for exchange completion and auto-redirect
// (only when autoRedirectToClient)
watch(
  () => context.value.exchangeData?.state,
  newState => {
    const shouldAutoRedirect = newState === 'complete' &&
      context.value.autoRedirectToClient !== false;
    if(shouldAutoRedirect) {
      continueToClient();
    }
  },
  {immediate: true}
);

</script>
