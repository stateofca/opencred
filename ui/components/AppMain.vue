<script setup>
  import {reactive} from 'vue';

  defineProps({
    step: String,
    rp: {
      redirect_uri: String,
      name: String,
      icon: String,
      background_image: String
    },
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

  const state = reactive({
    isQROpen: false
  });

  const switchView = () => {
    state.isQROpen = !state.isQROpen;
  }
</script>

<template>
  <div class="flex flex-col min-h-screen">
    <header class="" :style="{background: theme.header}">
      <div class="mx-auto flex justify-between items-center px-6 py-3 max-w-3xl">
        <a :href="rp.redirect_uri"
          class="flex items-center gap-3">
          <img :src="rp.icon" :alt="rp.name + 'Logo'" />
        </a>
        <button
          class="flex flex-row text-white items-center text-xs gap-3
                hover:underline">
          <span class="bg-white rounded-full p-1 flex">
            <img src="https://imagedelivery.net/I-hc6FAYxquPgv-npvTcWQ/505d9676-7f3a-49cc-bf9a-883439873d00/public" />
          </span>
          {{translations[defaultLanguage].translate}}
        </button>
      </div>
    </header>
    <main
      class="relative flex-grow">
      <div class="bg-white w-full text-center py-4">
        <h2 class="font-bold">Home</h2>
      </div>
      <div class="bg-no-repeat bg-cover clip-path-bg z-0 min-h-[360px]" 
        :style="{ 'background-image': `url(${rp.background_image})` }">
        <div class="text-center text-6xl py-10">
          &nbsp;
        </div>
      </div>
      <MainView
        v-if="!state.isQROpen"
        :translations="translations"
        :theme="theme"
        :defaultLanguage="defaultLanguage"
        :exchangeData="exchangeData"
        @switchView="switchView"/>
      <QRView
        v-else
        :translations="translations"
        :theme="theme"
        :defaultLanguage="defaultLanguage"
        :exchangeData="exchangeData"
        @switchView="switchView"/>
    </main>
    <footer class="text-left p-3"
      v-html="translations[defaultLanguage].copyright">
    </footer>
  </div>
</template>

<style>
a {
  color: v-bind('theme.primary')
}
</style>
