<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="flex flex-col items-center justify-center min-h-[360px] p-10">
    <h1 class="text-3xl font-bold mb-8 text-center">
      {{$t('verifyCredentialsTitle')}}
    </h1>
    <div
      v-if="workflowListingEnabled && publicWorkflows &&
        publicWorkflows.length > 0"
      class="w-full max-w-3xl">
      <p class="text-center text-lg mb-6 text-gray-700">
        {{$t('selectWorkflow')}}
      </p>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <a
          v-for="workflow in publicWorkflows"
          :key="workflow.clientId"
          :href="`/verification?client_id=${workflow.clientId}&variables=`"
          class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg
          transition-shadow border border-gray-200 hover:border-blue-500
          cursor-pointer flex flex-col">
          <h2 class="text-xl font-semibold mb-2 text-gray-800">
            {{workflow.name || workflow.clientId}}
          </h2>
          <p
            v-if="workflow.description"
            class="text-gray-600 text-sm flex-grow">
            {{workflow.description}}
          </p>
        </a>
      </div>
    </div>

    <div
      v-else-if="workflowListingEnabled"
      class="text-center text-gray-600">
      <p>{{$t('homePageGreeting')}}</p>
    </div>

    <div
      v-else
      class="text-center text-xl">
      <p>{{$t('homePageGreeting')}}</p>
    </div>
  </div>
</template>

<script setup>
import {computed, onBeforeMount, ref} from 'vue';
import {httpClient} from '@digitalbazaar/http-client';

const appConfig = ref({
  options: {
    workflowListingEnabled: false
  },
  publicWorkflows: []
});

const workflowListingEnabled = computed(() =>
  appConfig.value.options?.workflowListingEnabled === true
);

const publicWorkflows = computed(() =>
  appConfig.value.publicWorkflows || []
);

// Fetch context from /config/app.json
onBeforeMount(async () => {
  try {
    const resp = await httpClient.get(
      '/config/app.json' + window.location.search);
    appConfig.value = resp.data;
  } catch(e) {
    // Use default config on error
    console.error('Failed to fetch app config:', e);
  }
});
</script>
