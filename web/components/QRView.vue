<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<script setup>
import {inject, onMounted, ref} from 'vue';
import {config} from '@bedrock/web';
import {httpClient} from '@digitalbazaar/http-client';
import {useQuasar} from 'quasar';

const props = defineProps({
  brand: {
    type: Object,
    default: () => ({
      primary: ''
    })
  },
  exchangeData: {
    type: Object,
    default: () => ({
      QR: '',
      vcapi: '',
      OID4VP: '',
      oidc: {
        state: ''
      }
    })
  },
  explainerVideo: {
    type: Object,
    default: () => ({
      id: '',
      provider: ''
    })
  }
});
const emit = defineEmits(['switchView', 'replaceExchange']);
const switchView = () => emit('switchView');
const showDeeplink = ref(false);
const showVideo = ref(false);
const $q = useQuasar();
const $cookies = inject('$cookies');

onMounted(() => {
  if($q.platform.is.mobile) {
    showDeeplink.value = true;
  }
});

async function appOpened() {
  let exchange = {};
  ({
    data: exchange,
  } = await httpClient.post(
    `/workflows/${props.exchangeData.workflowId}` +
    `/exchanges`,
    {
      json: {
        redirectUrl: window.location.href,
        oidcState: props.exchangeData.oidc.state
      },
      headers: {
        Authorization: `Bearer ${props.exchangeData.accessToken}`
      }
    }
  ));
  emit('replaceExchange', exchange);
  $cookies.set('exchangeId', exchange.id, '15min',
    '', '', true, 'Strict');
  $cookies.set('accessToken', exchange.accessToken, '15min',
    '', '', true, 'Strict');
  window.location.replace(exchange.OID4VP);
}
</script>

<template>
  <div
    class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
           px-16 lg:px-24 relative text-center">
    <h1
      class="text-3xl mb-12 text-center"
      :style="{color: brand.primary}">
      {{$t('qrTitle')}}
    </h1>
    <div class="mb-2">
      <p
        v-if="$t('qrPageExplain')"
        v-html="$t('qrPageExplain')" />
      <p
        v-if="$t('qrPageExplainHelp')"
        class="mt-2"
        v-html="$t('qrPageExplainHelp')" />
    </div>
    <div
      v-if="showDeeplink"
      class="mb-4 flex justify-center">
      <button
        v-if="exchangeData"
        @click="appOpened()">
        <img :src="exchangeData.QR">
      </button>
    </div>
    <div
      v-else
      class="mb-4 flex justify-center">
      <img
        v-if="exchangeData.QR !== ''"
        :src="exchangeData.QR">
      <div
        v-else
        class="p-12 m-12">
        <q-spinner-tail
          color="primary"
          size="2em" />
      </div>
    </div>
    <div class="mt-2">
      <button
        v-if="$t('qrExplainerText') !== '' && props.explainerVideo.id !== ''
          && props.explainerVideo.provider"
        :style="{color: brand.primary}"
        class="underline"
        @click="showVideo = true">
        {{$t('qrExplainerText')}}
      </button>
      <p
        v-if="$t('qrFooterHelp')"
        class="mt-2"
        v-html="$t('qrFooterHelp')" />
    </div>
    <div
      v-if="$t('qrDisclaimer')"
      class="mt-12 flex flex-col items-center"
      v-html="$t('qrDisclaimer')" />
    <div v-if="config.options.exchangeProtocols.length > 1">
      <p class="text-center">
        <button
          :style="{color: brand.primary}"
          @click="switchView">
          {{$t('qrPageAnotherWay')}}
        </button>
      </p>
    </div>

    <q-dialog
      v-model="showVideo">
      <q-card>
        <YouTubeVideo
          v-if="explainerVideo.provider === 'youtube'"
          :id="explainerVideo.id" />
        <q-card-actions
          align="right">
          <q-btn
            v-close-popup
            flat
            label="Close" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>
