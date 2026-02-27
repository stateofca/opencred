<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="flex flex-col min-h-screen">
    <cadmv-header
      :ca-gov-url="brand?.primaryLogo?.href ?? brand?.primaryLink"
      :ca-gov-logo="typeof brand?.primaryLogo === 'string' ?
        brand?.primaryLogo : brand?.primaryLogo?.id"
      :ca-gov-alt="brand?.primaryLogo?.alt || 'logo-image'"
      :dmv-url="brand?.secondaryLogo?.href ?? brand?.secondaryLink"
      :dmv-logo="typeof brand?.secondaryLogo === 'string' ?
        brand?.secondaryLogo : brand?.secondaryLogo?.id"
      :dmv-alt="brand?.secondaryLogo?.alt || 'logo-image'">
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
              @click="handleLanguageChange(item)">
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
    </cadmv-header>
    <main class="relative flex-grow">
      <div
        v-if="workflow?.brand?.homeLink"
        class="bg-white w-full text-center">
        <h2 class="font-bold">
          <a :href="workflow.brand.homeLink">
            {{$t('home')}}
          </a>
        </h2>
      </div>
      <div
        v-if="props.showBackgroundImage && !props.hasError &&
          workflow?.brand?.backgroundImage"
        class="absolute top-0 left-0 right-0 bg-no-repeat bg-cover
               clip-path-bg z-0 min-h-[360px]"
        :style="{ 'background-image': `url(${
          typeof workflow?.brand?.backgroundImage === 'string' ?
            workflow?.brand?.backgroundImage :
            workflow?.brand?.backgroundImage?.id})` }">
        <div class="text-center text-6xl py-10">
&nbsp;
        </div>
      </div>
      <div class="relative mt-4 z-10">
        <router-view
          :has-error="props.hasError"
          @change-language="handleLanguageChange" />
      </div>
    </main>
    <footer
      class="flex flex-col md:flex-row items-center md:items-center
             justify-center md:justify-between gap-2 md:gap-0 p-3">
      <div
        class="text-left"
        v-html="$t('copyright')" />
    </footer>
  </div>
</template>

<script setup>
import {computed, onBeforeMount, onMounted, provide, ref, watch} from 'vue';
import {CadmvHeader} from '@digitalbazaar/cadmv-ui';
import {config} from '@bedrock/web';
import {httpClient} from '@digitalbazaar/http-client';
import {setCssVar} from 'quasar';
import {useHead} from 'unhead';
import {useI18n} from 'vue-i18n';
import {useRoute} from 'vue-router';

const props = defineProps({
  showBackgroundImage: {
    type: Boolean,
    default: true
  },
  hasError: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['changeLanguage']);

const useNativeTranslations = ref(true);
const {locale, availableLocales, t} = useI18n({useScope: 'global'});

const route = useRoute();

// Context for current workflow - will be fetched or use config default
const context = ref({
  workflow: {
    brand: config.brand || {}
  },
  initError: null
});

const brand = computed(() => context.value.workflow.brand);
const workflow = computed(() => context.value.workflow);

// Fetch context if needed (for initial render)
onBeforeMount(async () => {
  const exchangeType = route.name;
  // Skip context fetching for audit route (no context endpoint exists)
  if(exchangeType && exchangeType !== 'Audit Presentation') {
    try {
      const exchangeToken = new URLSearchParams(window.location.search)
        .get('exchange_token');
      const url = exchangeToken ?
        `/context/continue?exchange_token=${encodeURIComponent(
          exchangeToken)}` :
        `/context/${exchangeType}${window.location.search}`;
      const resp = await httpClient.get(url);
      context.value = resp.data;
      context.value.initError = null;
      if(resp.data.workflow.brand) {
        Object.keys(resp.data.workflow.brand).forEach(key => {
          setCssVar(key, resp.data.workflow.brand[key]);
        });
        // Set --q-primary to header color for CadmvHeader component
        if(resp.data.workflow.brand.header) {
          setCssVar('primary', resp.data.workflow.brand.header);
        }
      }
    } catch(e) {
      // Check if this is a 400 error with a message
      if(e.data?.message) {
        context.value.initError = {
          message: e.data.message
        };
      } else {
        // Use config default on other errors
        console.error('Failed to fetch context:', e);
      }
    }
  }
});

// Provide context to child components
provide('exchangeContext', context);

const handleLanguageChange = lang => {
  locale.value = lang;
  emit('changeLanguage', lang);
};

// Map route names to translation keys for page titles
const getPageTitleKey = routeName => {
  const routeTitleMap = {
    login: 'pageTitleLogin',
    verification: 'pageTitleVerification',
    'Audit Presentation': 'pageTitleAuditPresentation'
  };
  return routeTitleMap[routeName] || 'pageTitleHome';
};

// Set document title reactively based on route and locale
watch(
  [() => route.name, locale],
  () => {
    const titleKey = getPageTitleKey(route.name);
    const title = t(titleKey);
    useHead({title});
  },
  {immediate: true}
);

onMounted(() => {
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
    if(currentDiv) {
      currentDiv.appendChild(transEl);
    }
    useNativeTranslations.value = false;
    useHead({script: [{src: config.customTranslateScript}]});
  }
});
</script>

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

