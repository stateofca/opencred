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
  <div class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl px-32 relative">
      <h1 class="text-3xl mb-12 text-center" :style="{color: theme.primary}">
        {{translations[defaultLanguage].login_cta}}
      </h1>
      <p class="mb-4" v-html="translations[defaultLanguage].login_explain"></p>
      <p class="mb-6" v-html="translations[defaultLanguage].app_install_explain"></p>
      <div class="flex justify-center">
        <button class="text-white py-2 px-6 rounded-xl my-8"
          :style="{background: theme.cta}">
          {{translations[defaultLanguage].app_cta}}
        </button>
      </div>
      <p class="text-center mb-2" v-html="translations[defaultLanguage].qr_explain"></p>
      <p class="text-center">
        <button @click="switchView" :style="{color: theme.primary}">
          {{translations[defaultLanguage].qr_cta}}
        </button>
      </p>
    </div>
</template>