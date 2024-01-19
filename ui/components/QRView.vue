<script setup>
  const props = defineProps({
    step: String,
    translations: Object,
    defaultLanguage: String,
    theme: {
      cta: String,
      primary: String,
      header: String
    },
    options: {
      exchangeProtocols: Array
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
      {{translations[defaultLanguage].qrPageCta}}
    </h1>
    <p
      class="mb-6"
      v-html="translations[defaultLanguage].appInstallExplain"
    ></p>
    <p class="mb-4" v-html="translations[defaultLanguage].qrPageExplain"></p>
    <div class="mb-4 flex justify-center">
      <img :src="exchangeData.QR"/>
    </div>
    <div v-if="props.options.exchangeProtocols.includes('chapi') || props.options.exchangeProtocols.includes('oid4vp-button')">
      <p class="text-center mb-2" v-html="translations[defaultLanguage].qrPageAnotherWay">
      </p>
      <p class="text-center">
        <button @click="switchView" :style="{color: theme.primary}">
          {{translations[defaultLanguage].qrPageAnotherWayLink}}
        </button>
      </p>
    </div>
  </div>
</template>