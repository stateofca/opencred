<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

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
    <CadmvMainCard
      v-else
      :title="t('verificationTitle')">
      <div class="column items-center q-gutter-y-lg q-pa-md">
        <div class="col row items-center text-lg text-positive">
          <q-icon
            name="fas fa-circle-check"
            size="md"
            color="positive" />
          {{t('verificationSuccess')}}
        </div>
        <div>
          {{t('verificationDetails')}}
        </div>
        <CadmvButton
          variant="primary"
          :label="t('verificationCloseBtn')"
          @click="close" />
      </div>
    </CadmvMainCard>
  </div>
</template>

<script setup>
import {CadmvButton, CadmvMainCard} from '@digitalbazaar/cadmv-ui';
import ErrorView from '../components/ErrorView.vue';
import OpenCredExchange from '../components/OpenCredExchange.vue';
import {QIcon} from 'quasar';
import {useExchangeContext} from '../composables/useExchangeContext.js';
import {useReactiveI18n} from '../composables/useReactiveI18n.js';

// Get context
const {context, translations} = useExchangeContext();

const {t} = useReactiveI18n({messages: translations});

const close = () => window.close();

</script>
