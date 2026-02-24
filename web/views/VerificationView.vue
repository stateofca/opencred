<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div>
    <div
      v-if="context.initError"
      class="bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
             md:px-16 lg:px-24 relative">
      <ErrorView
        :title="$t('exchangeErrorTitle')"
        :subtitle="$t('exchangeErrorSubtitle')"
        :message="`${$t('exchangeInitError')}: ${context.initError.message}`" />
    </div>
    <OpenCredExchange
      v-else-if="context.exchangeData?.state !== 'complete'"
      purpose="verification" />
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
import {inject, provide} from 'vue';
import ErrorView from '../components/ErrorView.vue';
import OpenCredExchange from '../components/OpenCredExchange.vue';
import {QIcon} from 'quasar';

// Get context from parent component (AppLayout)
const context = inject('exchangeContext');

// Provide context to child components (OpenCredExchange)
provide('exchangeContext', context);

</script>
