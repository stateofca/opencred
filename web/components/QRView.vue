<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<script setup>
  import {onMounted, ref} from 'vue';
  import {config} from '@bedrock/web';

  const props = defineProps({
    step: String,
    brand: {
      cta: String,
      primary: String,
      header: String
    },
    exchangeData: {
      QR: String,
      vcapi: String,
      OID4VP: String
    }
  })
  const emit = defineEmits(['switchView']);
  const switchView = () => {
    emit('switchView');
  }
  const showDeeplink = ref(true);
  const showWarningMessage = ref(false);

  onMounted(() => {
    if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)){
      showDeeplink.value = true;
    }
  })

  function appOpened() {
    setTimeout(() => {
      showWarningMessage.value = true;
    }, 1000);
  }
</script>

<template>
  <div class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
              px-16 lg:px-24 relative text-center">
    <h1 class="text-3xl mb-12 text-center" :style="{color: brand.primary}">
      {{config.translations[config.defaultLanguage].qrTitle}}
    </h1>
    <div class="mb-2">
      <p v-if="config.translations[config.defaultLanguage].qrPageExplain"
         v-html="config.translations[config.defaultLanguage].qrPageExplain"></p>
      <p class="mt-2"
         v-if="config.translations[config.defaultLanguage].qrPageExplainHelp"
         v-html="config.translations[config.defaultLanguage].qrPageExplainHelp"></p>
    </div>
    <div v-if="showDeeplink" class="mb-4 flex justify-center">
      <a  v-if="exchangeData" :href="exchangeData.OID4VP" @click="appOpened()"><img :src="exchangeData.QR"/></a>
    </div>
    <div v-else class="mb-4 flex justify-center">
      <img v-if="exchangeData" :src="exchangeData.QR"/>
    </div>
    <div v-if="showWarningMessage && config.translations[config.defaultLanguage].qrClickMessage"
         class="mt-2 p-4 mb-4 text-sm text-yellow-800 rounded-lg bg-yellow-100" role="alert">
      <span class="text-medium">Note:</span> {{config.translations[config.defaultLanguage].qrClickMessage}}
    </div>
    <div class="mt-2">
      <p v-if="config.translations[config.defaultLanguage].qrFooter"
         v-html="config.translations[config.defaultLanguage].qrFooter"></p>
      <p class="mt-2"
         v-if="config.translations[config.defaultLanguage].qrFooterHelp"
         v-html="config.translations[config.defaultLanguage].qrFooterHelp"></p>
    </div>
    <div class="mt-12"
         v-if="config.translations[config.defaultLanguage].qrDisclaimer"
         v-html="config.translations[config.defaultLanguage].qrDisclaimer">
    </div>
    <div v-if="config.options.exchangeProtocols.length > 1">
      <p class="text-center">
        <button @click="switchView" :style="{color: brand.primary}">
          {{config.translations[config.defaultLanguage].qrPageAnotherWay}}
        </button>
      </p>
    </div>
  </div>
</template>