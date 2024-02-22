<script setup>
  import {config} from '@bedrock/web';

  const props = defineProps({
    step: String,
    theme: {
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
</script>

<template>
  <div class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
              px-16 lg:px-24 relative text-center">
    <h1 class="text-3xl mb-12 text-center" :style="{color: theme.primary}">
      {{config.translations[config.defaultLanguage].qrPageCta}}
    </h1>
    <p
      v-if="config.translations[config.defaultLanguage].appInstallExplain"
      class="mb-6"
      v-html="config.translations[config.defaultLanguage].appInstallExplain"
    ></p>
    <p class="mb-4" v-html="config.translations[config.defaultLanguage].qrPageExplain"></p>
    <div class="mb-4 flex justify-center">
      <img :src="exchangeData.QR"/>
    </div>
    <div v-if="config.options.exchangeProtocols.length > 1">
      <p class="text-center mb-2" v-html="config.translations[config.defaultLanguage].qrPageAnotherWay">
      </p>
      <p class="text-center">
        <button @click="switchView" :style="{color: theme.primary}">
          {{config.translations[config.defaultLanguage].qrPageAnotherWayLink}}
        </button>
      </p>
    </div>
  </div>
</template>