<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<script setup>
import {onMounted, ref} from 'vue';
import {config} from '@bedrock/web';
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
      OID4VP: ''
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
const emit = defineEmits(['switchView']);
const switchView = () => emit('switchView');
const showDeeplink = ref(false);
const showWarningMessage = ref(false);
const showVideo = ref(false);
const $q = useQuasar();

onMounted(() => {
  if($q.platform.is.mobile) {
    showDeeplink.value = true;
  }
});

function appOpened() {
  setTimeout(() => {
    showWarningMessage.value = true;
  }, 1000);
}
</script>

<template>
  <div
    class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
    px-16 lg:px-24 relative text-center">
    <h1
      class="text-3xl mb-12 text-center"
      :style="{color: brand.primary}">
      {{config.translations[config.defaultLanguage].qrTitle}}
    </h1>
    <div class="mb-2">
      <p
        v-if="config.translations[config.defaultLanguage].qrPageExplain"
        v-html="config.translations[config.defaultLanguage].qrPageExplain" />
      <p
        v-if="config.translations[config.defaultLanguage].qrPageExplainHelp"
        class="mt-2"
        v-html="config.translations[config.defaultLanguage]
          .qrPageExplainHelp" />
    </div>
    <div
      v-if="showDeeplink"
      class="mb-4 flex justify-center">
      <a
        v-if="exchangeData"
        :href="exchangeData.OID4VP"
        @click="appOpened()"><img :src="exchangeData.QR"></a>
    </div>
    <div
      v-else
      class="mb-4 flex justify-center">
      <img
        v-if="exchangeData"
        :src="exchangeData.QR">
    </div>
    <div
      v-if="showWarningMessage &&
        config.translations[config.defaultLanguage].qrClickMessage"
      class="mt-2 p-4 mb-4 text-sm text-yellow-800 rounded-lg bg-yellow-100"
      role="alert">
      <span class="text-medium pr-2">Note:</span>
      {{config.translations[config.defaultLanguage].qrClickMessage}}
    </div>
    <div class="mt-2">
      <button
        v-if="config.translations[config.defaultLanguage].qrExplainerText !== ''
          && props.explainerVideo.id !== '' && props.explainerVideo.provider"
        :style="{color: brand.primary}"
        class="underline"
        @click="showVideo = true">
        {{config.translations[config.defaultLanguage].qrExplainerText}}
      </button>
      <p
        v-if="config.translations[config.defaultLanguage].qrFooterHelp"
        class="mt-2"
        v-html="config.translations[config.defaultLanguage].qrFooterHelp" />
    </div>
    <div
      v-if="config.translations[config.defaultLanguage].qrDisclaimer"
      class="mt-12 flex flex-col items-center"
      v-html="config.translations[config.defaultLanguage].qrDisclaimer" />
    <div v-if="config.options.exchangeProtocols.length > 1">
      <p class="text-center">
        <button
          :style="{color: brand.primary}"
          @click="switchView">
          {{config.translations[config.defaultLanguage].qrPageAnotherWay}}
        </button>
      </p>
    </div>

    <q-dialog
      v-model="showVideo">
      <q-card>
        <YoutubeVideo
          v-if="explainerVideo.provider === 'youtube'"
          :id="explainerVideo.id" />
      </q-card>
    </q-dialog>
  </div>
</template>
