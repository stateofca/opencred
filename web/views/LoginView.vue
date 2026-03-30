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
        <i18n-t
          v-if="showLoginContinue"
          keypath="loginRedirectManualHint"
          tag="p"
          class="flex flex-wrap items-center justify-center gap-x-2 gap-y-3
                 text-center max-w-xl mx-auto">
          <template #continue>
            <cadmv-button
              variant="primary"
              @click="continueToClient">
              {{$t('continueToClient', {
                name: context.workflow.name || 'client'
              })}}
            </cadmv-button>
          </template>
        </i18n-t>
      </div>
    </div>
  </div>
</template>

<script setup>
import {computed, nextTick, onBeforeMount, onBeforeUnmount, provide, ref,
  watch} from 'vue';
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

const autoRedirectTimerId = ref(null);
const schedulingAutoRedirect = ref(false);

function clearAutoRedirectTimer() {
  if(autoRedirectTimerId.value != null) {
    clearTimeout(autoRedirectTimerId.value);
    autoRedirectTimerId.value = null;
  }
  schedulingAutoRedirect.value = false;
}

const showLoginContinue = computed(() =>
  context.value.exchangeData?.state === 'complete' &&
  Boolean(context.value.exchangeData?.oidc?.code) &&
  Boolean(context.value.workflow?.oidc?.redirectUri));

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

onBeforeUnmount(clearAutoRedirectTimer);

// Provide context to child components (OpenCredExchange)
provide('exchangeContext', context);

// Navigate to client redirect URI with code and state
const continueToClient = () => {
  const {exchangeData, workflow} = context.value;
  const redirectUri = workflow?.oidc?.redirectUri;
  if(!exchangeData?.oidc?.code || !redirectUri) {
    return;
  }
  const queryParams = new URLSearchParams({
    state: exchangeData.oidc.state,
    code: exchangeData.oidc.code
  });
  window.location.href = `${redirectUri}?${queryParams.toString()}`;
};

// Auto-redirect after a short delay so success + manual-continue UI can render
watch(
  () => ({
    state: context.value.exchangeData?.state,
    code: context.value.exchangeData?.oidc?.code,
    redirectUri: context.value.workflow?.oidc?.redirectUri,
    autoRedirect: context.value.autoRedirectToClient
  }),
  current => {
    if(current.state !== 'complete' || !current.code || !current.redirectUri) {
      clearAutoRedirectTimer();
      return;
    }
    if(current.autoRedirect === false) {
      clearAutoRedirectTimer();
      return;
    }
    if(schedulingAutoRedirect.value || autoRedirectTimerId.value != null) {
      return;
    }
    schedulingAutoRedirect.value = true;
    nextTick(() => {
      requestAnimationFrame(() => {
        autoRedirectTimerId.value = window.setTimeout(() => {
          autoRedirectTimerId.value = null;
          schedulingAutoRedirect.value = false;
          continueToClient();
        }, 250);
      });
    });
  },
  {deep: true, immediate: true}
);

</script>
