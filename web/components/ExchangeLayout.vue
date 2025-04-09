<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<script setup>
import {inject, onBeforeMount, onMounted, onUnmounted, reactive,
  ref} from 'vue';
import CHAPIView from './CHAPIView.vue';
import {config} from '@bedrock/web';
import {httpClient} from '@digitalbazaar/http-client';
import OID4VPView from './OID4VPView.vue';
import QRCode from 'qrcode';
import {setCssVar} from 'quasar';
import {useHead} from 'unhead';
import {useI18n} from 'vue-i18n';
import {useRoute} from 'vue-router';

const $cookies = inject('$cookies');

const useNativeTranslations = ref(true);
const context = ref({
  rp: {
    brand: config.brand
  }
});

const state = reactive({
  currentUXMethodIndex: 0,
  active: false,
  activeOverride: false,
  error: null,
  intervalId: null,
  statusCheckCount: 0
});

/**
 * Set state.error to the given error object, with defaults applied.
 * @param {Object} error
 * @param {string?} error.title
 * @param {string?} error.message
 * @param {boolean?} error.resettable
 */
const handleError = error => {
  state.intervalId = clearInterval(state.intervalId);
  state.error = {
    title: error?.title || 'Error',
    subtitle: error?.subtitle || 'The following error was encountered:',
    message: error?.message || 'An unexpected error occurred.',
    resettable: !!error?.resettable || false
  };
  state.active = false;
  state.activeOverride = false;
  state.statusCheckCount = 0;
  $cookies.remove('accessToken');
  $cookies.remove('exchangeId');
};

const route = useRoute();
const {locale, availableLocales, t: translate} = useI18n({useScope: 'global'});

const switchView = () => {
  state.currentUXMethodIndex = (state.currentUXMethodIndex + 1) %
    config.options.exchangeProtocols.length;
};

onBeforeMount(async () => {
  if(context.value?.exchangeData?.id) {
    return;
  }
  const exchangeType = route.name;
  try {
    const resp = await httpClient.get(
      `/context/${exchangeType}${window.location.search}`
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
      handleError({
        title: `${data.error} error`,
        message: data.error_description
      });
    } else {
      handleError({
        title: `Error code ${status}`,
        message: 'An error occurred while loading the application.'
      });
    }
  }
});

const changeLanguage = lang => {
  locale.value = lang;
};

const checkStatus = async () => {
  if(!context.value || !context.value.rp?.workflow?.id ||
    !context.value.exchangeData?.id) {
    return;
  }

  // Check if exchange TTL has expired and show appropriate error if so
  const ttlDate = new Date(
    new Date(context.value.exchangeData.createdAt).getTime() +
      context.value.exchangeData.ttl * 1000);
  if(ttlDate < new Date()) {
    handleError({
      title: translate('exchangeErrorTitle'),
      subtitle: translate('exchangeErrorSubtitle'),
      message: translate('exchangeErrorTtlExpired'),
      resettable: true
    });
  }

  if(state.error && state.intervalId) {
    state.intervalId = clearInterval(state.intervalId);
    return;
  }
  state.statusCheckCount++;
  if(state.statusCheckCount > 10) {
    state.intervalId = clearInterval(state.intervalId);
  }

  try {
    let exchange = {};
    ({
      data: {exchange},
    } = await httpClient.get(
      `/workflows/${context.value.rp.workflow.id}/exchanges/` +
      `${context.value?.exchangeData?.id}`,
      {
        headers: {
          Authorization: `Bearer ${context.value.exchangeData.accessToken}`
        }
      }
    ));
    if(Object.keys(exchange).length > 0 && exchange.state === 'complete') {
      context.value.exchangeData = exchange;
      state.intervalId = clearInterval(state.intervalId);
      state.active = false;
      state.activeOverride = false;
      $cookies.remove('accessToken');
      $cookies.remove('exchangeId');
    } else if(exchange.state === 'active' && !state.activeOverride) {
      state.active = true;
    } else if(exchange.state === 'invalid') {
      handleError({
        title: translate('exchangeErrorTitle'),
        subtitle: translate('exchangeErrorSubtitle'),
        message: Object.values(exchange.variables.results ?? {})
          .filter(v => !!v.errors?.length)?.map(r => r.errors)
          .flat()
          .join(', ') ?? 'An error occurred while processing the exchange.',
        resettable: true
      });
    }

  } catch(e) {
    console.error('An error occurred while polling the endpoint:', e);
    handleError({
      title: 'Error',
      message: 'An error occurred while checking exchange status.'
    });
  }
};

const startStatusCheck = () => {
  state.statusCheckCount = 0;
  state.intervalId = setInterval(checkStatus, 5000);
};

const handleResetExchange = async () => {
  state.active = true;
  state.activeOverride = false;

  try {
    const resetResult = await httpClient.post(
      `/workflows/${context.value.rp.workflow.id}/exchanges/` +
    `${context.value.exchangeData.id}/reset`,
      {
        headers: {
          Authorization: `Bearer ${context.value.exchangeData.accessToken}`
        }
      }
    );
    context.value.exchangeData = {
      ...resetResult.data,
      QR: await QRCode.toDataURL(resetResult.data.OID4VP)
    };
    state.error = null;
    startStatusCheck();
  } catch(e) {
    handleError({
      title: 'Error',
      message: 'An error occurred while resetting the exchange.'
    });
    // Fall through to clear the active state after causing the error to display
  }

  state.active = false;
  state.activeOverride = false;
};

const replaceExchange = exchange => {
  context.value = {...context.value, exchangeData: exchange};
};

onMounted(async () => {
  setTimeout(checkStatus, 500);
  startStatusCheck();

  if(config.customTranslateScript) {
    const transEl = document.createElement('google-translate');
    if(config.customTranslateScript.indexOf('translate.google.com') >= 0) {
      transEl.setAttribute('id', 'google_translate_element');
      transEl.setAttribute('class', 'not-white');
      window.googleTranslateElementInit = () => {
        // eslint-disable-next-line no-undef
        new google.translate.TranslateElement(
          {pageLanguage: 'en'},
          'google_translate_element'
        );
      };
    }
    const currentDiv = document.getElementById('translations-btn');
    currentDiv.appendChild(transEl);
    useNativeTranslations.value = false;
    useHead({script: [{src: config.customTranslateScript}]});
  }
});

onUnmounted(() => {
  if(state.intervalId) {
    state.intervalId = clearInterval(state.intervalId);
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
            class="max-h-[50px]"
            :src="context.rp.primaryLogo"
            alt="logo-image">
        </a>
        <a
          v-if="context.rp.secondaryLogo"
          :href="context.rp.secondaryLink"
          class="flex items-center gap-3">
          <img
            class="max-h-[50px]"
            :src="context.rp.secondaryLogo"
            alt="logo-image">
        </a>
        <div
          id="translations-btn"
          class="flex-grow flex justify-end items-center gap-3">
          <q-btn-dropdown
            v-if="availableLocales.length > 1 && useNativeTranslations"
            flat
            no-caps
            text-color="white">
            <template #label>
              <div class="row items-center no-wrap gap-2 text-white">
                <span class="bg-white rounded-full p-1 flex">
                  <TranslateIcon />
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
            v-else-if="!useNativeTranslations"
            class="row items-center no-wrap gap-2 ">
            <span class="bg-white rounded-full p-1 flex">
              <TranslateIcon />
            </span>
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
      <div v-if="context.exchangeData?.state == 'complete'">
        <router-view
          :exchange="context.value?.exchangeData"
          :rp="context.rp" />
      </div>
      <div v-else-if="state.error">
        <div class="flex justify-center pt-8">
          <ErrorView
            :title="state.error.title"
            :message="state.error.message"
            :resettable="state.error.resettable"
            @reset="handleResetExchange" />
        </div>
      </div>
      <CHAPIView
        v-else-if="config.options.exchangeProtocols[state.currentUXMethodIndex]
          === 'chapi'"
        :chapi-enabled="true"
        :rp="context.rp"
        :options="config.options"
        :exchange-data="context.exchangeData"
        @switch-view="switchView" />
      <!-- eslint-disable max-len -->
      <OID4VPView
        v-else-if="config.options.exchangeProtocols[state.currentUXMethodIndex]
          === 'openid4vp'"
        :brand="context.rp?.brand"
        :exchange-data="context.exchangeData"
        :options="config.options"
        :explainer-video="context.rp?.explainerVideo"
        :active="state.active && !state.activeOverride"
        @switch-view="switchView"
        @override-active="state.activeOverride = true"
        @replace-exchange="replaceExchange"
        @error="handleError" />
      <!-- eslint-enable max-len -->

      <div
        v-if="context.value?.exchangeData?.state != 'complete' &&
          state.statusCheckCount > 10"
        class="fixed inset-0 flex items-center justify-center
              bg-gray-800 bg-opacity-75 z-50">
        <div class="bg-white rounded-lg p-6 max-w-2xl mx-auto relative">
          <p class="text-sm text-center">
            <span class="text-bold">Are you still there? </span>
            Status checking is paused.
          </p>
          <div class="flex justify-center mt-4 space-x-4">
            <button
              class="bg-blue-700 text-white py-2 px-4 rounded"
              @click="startStatusCheck">
              Resume checking
            </button>
            <button
              class="bg-white text-red-700 border border-red-700
                 py-2 px-4 rounded"
              @click="handleResetExchange">
              Reset Session
            </button>
          </div>
        </div>
      </div>
    </main>
    <footer
      class="text-left p-3"
      v-html="$t('copyright')" />
  </div>
</template>

<style>
a {
  color: var(--q-primary) !important;
  text-decoration: underline !important;
}
google-translate:not(.not-white) a {
  color: white !important;
  text-decoration: none !important;
}
#beforeGTranslateEl {
  list-style: disc;
  padding-left: 20px;
}
.goog-te-combo {
  border: 2px;
}
.goog-te-gadget {
  display: flex;
  gap: 3px;
  align-items: center;
  background-color: white;
  padding-right: 5px;
}
.goog-te-gadget img {
  display: inline;
}
#js-site-translate p {
  padding-bottom: 10px;
}
</style>
