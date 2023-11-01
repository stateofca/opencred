<script setup>
  import {defineEmits} from 'vue';
  defineProps({
    step: String,
    translations: Object,
    defaultLanguage: String,
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
      {{translations[defaultLanguage].qr_page_cta}}
    </h1>
    <p class="mb-4" v-html="translations[defaultLanguage].qr_page_explain"></p>
    <div class="mb-4 flex justify-center">
      <img :src="exchangeData.QR"/>
    </div>
    <p class="text-center mb-2" v-html="translations[defaultLanguage].qr_page_another_way">
    </p>
    <p class="text-center">
      <button @click="switchView" :style="{color: theme.primary}">
        {{translations[defaultLanguage].qr_page_another_way_link}}
      </button>
    </p>
  </div>
</template>