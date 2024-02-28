<script setup>
import { config } from '@bedrock/web';
import { ref } from "vue";
import { getCredentials } from "../chapi.js";

const props = defineProps({
  chapiEnabled: Boolean,
  step: String,
  rp: {
    clientId: String,
    redirectUri: String,
    name: String,
    icon: String,
    backgroundImage: String,
    workflow: {
      id: String,
      type: String,
    },
    brand: {
      cta: String,
      primary: String,
      header: String,
    },
  },
  exchangeData: {
    id: String,
    vcapi: String,
    OID4VP: String,
    accessToken: String
  },
});

const emit = defineEmits(["switchView"]);
const switchView = () => {
  emit("switchView");
};
const loading = ref(false);

const openChapi = async () => {
  const req = await getCredentials({
    queries: {},
    protocols: {
      OID4VP: props.exchangeData.OID4VP, // vcapi currently ignored
    },
  });
  if (req.dataType === "OutOfBand") {
    loading.value = true;
  }
};

</script>
<template>
  <div
    class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl px-16 lg:px-24 relative"
  >
    <h1
      class="text-3xl mb-12 text-center font-semibold"
      :style="{ color: rp.brand.primary }"
    >
      {{ config.translations[config.defaultLanguage].loginCta }}
    </h1>
    <p class="mb-4" v-html="config.translations[config.defaultLanguage].loginExplain"></p>
    <p
      v-if="config.translations[config.defaultLanguage].appInstallExplain"
      class="mb-6"
      v-html="config.translations[config.defaultLanguage].appInstallExplain"
    ></p>
    <div class="flex justify-center">
      <button
        v-if="!loading && chapiEnabled"
        @click="openChapi"
        class="text-white py-2 px-6 rounded-xl my-8"
        :style="{ background: rp.brand.cta }"
      >
        {{ config.translations[config.defaultLanguage]['appCta-chapi-label'] || config.translations[config.defaultLanguage].appCta }}
      </button>
      <a
        v-else-if="!loading && !chapiEnabled"
        :href="exchangeData.OID4VP"
        class="text-white py-2 px-6 rounded-xl my-8"
        :style="{ background: rp.brand.cta }"
        target="_blank"
      >
        {{ config.translations[config.defaultLanguage]['appCta-openid4vp-label'] || config.translations[config.defaultLanguage].appCta }}
      </a>
      <div
        v-else
        class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] py-2 my-8 motion-reduce:animate-[spin_1.5s_linear_infinite]"
        :style="{ color: rp.brand.primary }"
        role="status"
      >
        <span
          class="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]"
          >Loading...</span
        >
      </div>
    </div>
    <div v-if="config.options.exchangeProtocols.length > 1">
      <p
        class="text-center mb-2"
        v-html="config.translations[config.defaultLanguage].qrExplain"
      ></p>
      <p class="text-center">
        <button @click="switchView" :style="{ color: rp.brand.primary }">
          {{ config.translations[config.defaultLanguage].chapiPageAnotherWay }}
        </button>
      </p>
    </div>
  </div>
</template>