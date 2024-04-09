<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<script setup>
import {config} from '@bedrock/web';
import {getCredentials} from '../chapi.js';
import {ref} from 'vue';

const props = defineProps({
  chapiEnabled: Boolean,
  rp: {
    type: Object,
    default: () => ({
      backgroundImage: '',
      brand: {
        cta: '',
        primary: ''
      }
    })
  },
  exchangeData: {
    type: Object,
    default: () => ({
      OID4VP: ''
    })
  }
});

const emit = defineEmits(['switchView']);
const switchView = () => {
  emit('switchView');
};
const loading = ref(false);

const openChapi = async () => {
  const req = await getCredentials({
    queries: {},
    protocols: {
      OID4VP: props.exchangeData.OID4VP, // vcapi currently ignored
    },
  });
  if(req.dataType === 'OutOfBand') {
    loading.value = true;
  }
};

</script>
<template>
  <div
    class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
           px-16 lg:px-24 relative">
    <h1
      class="text-3xl mb-12 text-center font-semibold"
      :style="{ color: rp.brand.primary }">
      {{$t('loginCta')}}
    </h1>
    <p
      class="mb-4"
      v-html="$t('loginExplain')" />
    <p
      v-if="$t('appInstallExplain')"
      class="mb-6"
      v-html="$t('appInstallExplain')" />
    <div class="flex justify-center">
      <button
        v-if="!loading && chapiEnabled"
        class="text-white py-2 px-6 rounded-xl my-8"
        :style="{ background: rp.brand.cta }"
        @click="openChapi">
        {{$t('appCta-chapi-label') || $t('appCta')}}
      </button>
      <a
        v-else-if="!loading && !chapiEnabled"
        :href="exchangeData.OID4VP"
        class="text-white py-2 px-6 rounded-xl my-8"
        :style="{ background: rp.brand.cta }"
        target="_blank">
        {{$t('appCta-openid4vp-label') || $t('appCta')}}
      </a>
      <div
        v-else
        class="inline-block h-8 w-8 animate-spin rounded-full border-4
               border-solid border-current border-r-transparent align-[-0.125em]
               py-2 my-8 motion-reduce:animate-[spin_1.5s_linear_infinite]"
        :style="{ color: rp.brand.primary }"
        role="status">
        <span
          class="!absolute !-m-px !h-px !w-px !overflow-hidden
                 !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
          Loading...
        </span>
      </div>
    </div>
    <div v-if="config.options.exchangeProtocols.length > 1">
      <p class="text-center">
        <button
          :style="{ color: rp.brand.primary }"
          @click="switchView">
          {{$t('chapiPageAnotherWay')}}
        </button>
      </p>
    </div>
  </div>
</template>
