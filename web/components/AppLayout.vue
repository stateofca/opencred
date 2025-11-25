<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="flex flex-col min-h-screen">
    <cadmv-header
      :ca-gov-url="rp?.brand?.primaryLogo?.href ?? rp?.brand?.primaryLink"
      :ca-gov-logo="typeof rp?.brand?.primaryLogo === 'string' ?
        rp?.brand?.primaryLogo : rp?.brand?.primaryLogo?.id"
      :ca-gov-alt="rp?.brand?.primaryLogo?.alt || 'logo-image'"
      :dmv-url="rp?.brand?.secondaryLogo?.href ?? rp?.brand?.secondaryLink"
      :dmv-logo="typeof rp?.brand?.secondaryLogo === 'string' ?
        rp?.brand?.secondaryLogo : rp?.brand?.secondaryLogo?.id"
      :dmv-alt="rp?.brand?.secondaryLogo?.alt || 'logo-image'">
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
        v-if="rp?.brand?.homeLink"
        class="bg-white w-full text-center">
        <h2 class="font-bold">
          <a :href="rp.brand.homeLink">
            {{$t('home')}}
          </a>
        </h2>
      </div>
      <div
        v-if="props.showBackgroundImage && !props.hasError &&
          rp?.brand?.backgroundImage"
        class="bg-no-repeat bg-cover clip-path-bg z-0 min-h-[360px]"
        :style="{ 'background-image': `url(${
          typeof rp?.brand?.backgroundImage === 'string' ?
            rp?.brand?.backgroundImage :
            rp?.brand?.backgroundImage?.id})` }">
        <div class="text-center text-6xl py-10">
&nbsp;
        </div>
      </div>
      <router-view
        :has-error="props.hasError"
        @change-language="handleLanguageChange" />
    </main>
    <footer
      class="text-left p-3"
      v-html="$t('copyright')" />
  </div>
</template>

<script setup>
import {computed, onBeforeMount, onMounted, provide, ref} from 'vue';
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
const {locale, availableLocales} = useI18n({useScope: 'global'});

const route = useRoute();

// Context for rp - will be fetched or use config default
const context = ref({
  rp: {
    brand: config.brand || {}
  }
});

const rp = computed(() => context.value.rp);

// Fetch context if needed (for initial render)
onBeforeMount(async () => {
  const exchangeType = route.name;
  if(exchangeType) {
    try {
      const resp = await httpClient.get(
        `/context/${exchangeType}${window.location.search}`
      );
      context.value = resp.data;
      if(resp.data.rp.brand) {
        Object.keys(resp.data.rp.brand).forEach(key => {
          setCssVar(key, resp.data.rp.brand[key]);
        });
        // Set --q-primary to header color for CadmvHeader component
        if(resp.data.rp.brand.header) {
          setCssVar('primary', resp.data.rp.brand.header);
        }
      }
    } catch(e) {
      // Use config default on error
      console.error('Failed to fetch context:', e);
    }
  }
});

// Provide context to child components
provide('exchangeContext', context);

const handleLanguageChange = lang => {
  locale.value = lang;
  emit('changeLanguage', lang);
};

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

