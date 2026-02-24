<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="mb-4 justify-center text-center">
    <div
      class="relative-position mx-auto"
      :style="{
        maxWidth: '320px',
        minHeight: '320px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }">
      <p
        v-if="$t('qrPageExplainHelp') !== ''"
        class="mt-2 text-gray-900"
        v-html="$t('qrPageExplainHelp')" />
      <img
        v-if="props.qrCodeDataUri"
        :src="props.qrCodeDataUri"
        class="mx-auto"
        :style="{ opacity: active ? 0.2 : 1 }">
      <q-spinner-tail
        v-if="active"
        class="no-pointer-events absolute-center text-primary"
        size="5em" />
    </div>
    <p class="text-gray-900 mt-4">
      {{$t('exchangeActiveExpiryMessage')}}
      <CountdownDisplay
        v-if="exchangeData?.createdAt && exchangeData?.ttl"
        :created-at="exchangeData.createdAt"
        :ttl="exchangeData.ttl" />
    </p>
    <button
      v-if="active"
      class="mx-auto max-w-prose text-sm underline text-gray-900 mt-2"
      @click="handleGoBack">
      {{$t('exchangeActiveGoBack')}}
    </button>
    <div
      v-if="exchangeState === 'pending' || exchangeState === 'active'"
      class="mt-4">
      <cadmv-button
        no-caps
        variant="flat"
        label="Launch on this device"
        @click="handleToggleSameDevice" />
    </div>
    <!-- Disclaimer -->
    <div
      v-if="$t('qrDisclaimer')"
      class="mt-12 flex flex-col items-center text-gray-900"
      v-html="$t('qrDisclaimer')" />
  </div>
</template>

<script setup>
import {CadmvButton} from '@digitalbazaar/cadmv-ui';
import CountdownDisplay from '../CountdownDisplay.vue';
import {QSpinnerTail} from 'quasar';

const props = defineProps({
  qrCodeDataUri: {
    type: String,
    default: ''
  },
  exchangeState: {
    type: String,
    default: 'pending'
  },
  exchangeData: {
    type: Object,
    default: () => ({
      createdAt: null,
      ttl: null
    })
  },
  qrState: {
    type: Object,
    default: () => ({})
  },
  active: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['toggleSameDevice', 'goBack']);

const handleToggleSameDevice = () => {
  emit('toggleSameDevice');
};

const handleGoBack = () => {
  emit('goBack');
};
</script>

