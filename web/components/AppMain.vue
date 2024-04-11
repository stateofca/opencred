<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<script setup>
import {inject, onBeforeMount, onMounted, reactive, ref} from 'vue';
import {config} from '@bedrock/web';
import {httpClient} from '@digitalbazaar/http-client';
import {setCssVar} from 'quasar';
import {useI18n} from 'vue-i18n';

let intervalId;
const $cookies = inject('$cookies');
const useNativeTranslations = ref(true);
const vp = ref(null);
const context = ref({
  rp: {
    brand: config.brand,
    rp: {
      brand: config.brand
    }
  }
});

const state = reactive({
  currentUXMethodIndex: 0,
  error: null
});

const {locale, availableLocales} = useI18n({useScope: 'global'});

const switchView = () => {
  state.currentUXMethodIndex = (state.currentUXMethodIndex + 1) %
    config.options.exchangeProtocols.length;
};

onBeforeMount(async () => {
  try {
    const resp = await httpClient.get(
      `/context/login${window.location.search}`
    );
    context.value = resp.data;
    if(resp.data.rp.brand) {
      Object.keys(resp.data.rp.brand).forEach(key => {
        setCssVar(key, resp.data.rp.brand[key]);
      });
    }
  } catch(e) {
    const {status, data} = e;
    console.error('An error occurred while loading the application:', e);
    if(data && data.error_description) {
      state.error = {
        title: `${data.error} error`,
        message: data.error_description
      };
    } else {
      state.error = {
        title: `Error code ${status}`,
        message: 'An error occurred while loading the application.'
      };
    }
  }
});

const changeLanguage = lang => {
  locale.value = lang;
};

const checkStatus = async () => {
  if(!context.value) {
    return;
  }
  if(state.error && intervalId) {
    intervalId = clearInterval(intervalId);
    return;
  }

  try {
    let exchange = {};
    ({
      data: {exchange},
    } = await httpClient.get(
      `/workflows/${context.value.rp.workflow.id}/exchanges/` +
      `${context.value.exchangeData.id}`,
      {
        headers: {
          Authorization: `Bearer ${context.value.exchangeData.accessToken}`
        }
      }
    ));
    if(Object.keys(exchange).length > 0) {
      const urlParams = new URLSearchParams(window.location.search);
      const preventRedirect = urlParams.has('preventRedirect');
      if(exchange.state === 'complete' && exchange.oidc?.code &&
         !preventRedirect) {
        const queryParams = new URLSearchParams({
          state: context.value.exchangeData.oidc.state,
          code: exchange.oidc.code,
        });
        const destination = `${context.value.rp.redirectUri}?` +
          `${queryParams.toString()}`;
        $cookies.remove('accessToken');
        $cookies.remove('exchangeId');
        window.location.href = destination;
        intervalId = clearInterval(intervalId);
      } else if(exchange.state === 'complete') {
        const {verifiablePresentation} =
          exchange.variables.results[exchange.step];
        vp.value = verifiablePresentation;
        intervalId = clearInterval(intervalId);
      }
    }
  } catch(e) {
    const {status} = e;
    console.error('An error occurred while polling the endpoint:', e);
    state.error = state.error = `Error code ${
      status}: An error occurred while checking exchange status.`;
  }
};

const replaceExchange = exchange => {
  context.value = {...context.value, exchangeData: exchange};
};

onMounted(async () => {
  setTimeout(checkStatus, 500);
  intervalId = setInterval(checkStatus, 5000);

  if(config.customTranslateScript) {
    const scr = document.createElement('script');
    scr.src = config.customTranslateScript;
    document.getElementsByTagName('HEAD')[0].appendChild(scr);
    useNativeTranslations.value = false;
  }
});
</script>

<template>
  <div class="flex flex-col min-h-screen">
    <header :style="{ background: context.rp.brand.header }">
      <div
        class="mx-auto flex gap-2 justify-between items-center px-6 py-3
        max-w-3xl">
        <a
          v-if="context.rp.primaryLogo"
          :href="context.rp.primaryLink"
          class="flex items-center gap-3">
          <img
            :src="context.rp.primaryLogo"
            alt="logo-image">
        </a>
        <a
          v-if="context.rp.secondaryLogo"
          :href="context.rp.secondaryLink"
          class="flex items-center gap-3">
          <img
            :src="context.rp.secondaryLogo"
            alt="logo-image">
        </a>
        <div class="flex-grow flex justify-end">
          <q-btn-dropdown
            v-if="availableLocales.length > 1 && useNativeTranslations"
            flat
            no-caps
            text-color="white">
            <template #label>
              <div class="row items-center no-wrap gap-2 text-white">
                <span class="bg-white rounded-full p-1 flex">
                  <img :src="config.translationsIcon">
                </span>
                {{$t('translate')}}
              </div>
            </template>
            <q-list>
              <q-item
                v-for="(item, index) in availableLocales"
                :key="index"
                v-close-popup
                clickable
                @click="changeLanguage(item)">
                <q-item-section>
                  <q-item-label>
                    {{$t(`languages.${item}`)}}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
          <div
            v-else
            class="row items-center no-wrap gap-2 ">
            <span class="bg-white rounded-full p-1 flex">
              <img :src="config.translationsIcon">
            </span>
            <google-translate />
          </div>
        </div>
      </div>
    </header>
    <main class="relative flex-grow">
      <div
        v-if="context.rp.homeLink"
        class="bg-white w-full text-center py-4">
        <h2 class="font-bold">
          <a :href="context.rp.homeLink">
            {{$t('home')}}
          </a>
        </h2>
      </div>
      <div
        v-if="!state.error"
        class="bg-no-repeat bg-cover clip-path-bg z-0 min-h-[360px]"
        :style="{ 'background-image': `url(${context.rp.backgroundImage})` }">
        <div class="text-center text-6xl py-10">
&nbsp;
        </div>
      </div>
      <div v-if="vp">
        <div class="flex justify-center">
          <JsonView
            :data="{ vp }"
            title="Verified Credential" />
        </div>
      </div>
      <div v-else-if="state.error">
        <div class="flex justify-center pt-8">
          <ErrorView
            :title="state.error.title"
            :error="state.error.message" />
        </div>
      </div>
      <ButtonView
        v-else-if="config.options.exchangeProtocols[state.currentUXMethodIndex]
          === 'chapi'"
        :chapi-enabled="true"
        :rp="context.rp"
        :options="config.options"
        :exchange-data="context.exchangeData"
        @switch-view="switchView" />
      <QRView
        v-else-if="config.options.exchangeProtocols[state.currentUXMethodIndex]
          === 'openid4vp'"
        :brand="context.rp.brand"
        :exchange-data="context.exchangeData"
        :options="config.options"
        :explainer-video="context.rp?.explainerVideo"
        @switch-view="switchView"
        @replace-exchange="replaceExchange" />
    </main>
    <footer
      class="text-left p-3"
      v-html="$t('copyright')" />
  </div>
</template>

<style>
a {
  color: white !important;
  text-decoration: underline !important;
}
</style>
