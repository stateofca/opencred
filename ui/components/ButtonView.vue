<script setup>
import { defineEmits, ref } from "vue";
import { getCredentials } from "../chapi.js";
import { httpClient } from "@digitalbazaar/http-client";

const props = defineProps({
  step: String,
  translations: Object,
  defaultLanguage: String,
  rp: {
      client_id: String,
      redirect_uri: String,
      name: String,
      icon: String,
      background_image: String
    },
  theme: {
    cta: String,
    primary: String,
    header: String,
  },
  exchangeData: {
    vcapi: String,
    OID4VP: String,
  },
});

const emit = defineEmits(["switchView"]);
const switchView = () => {
  emit("switchView");
};
const loading = ref(false);
let intervalId;
const vp = ref(null);

const openChapi = async () => {
  const req = await getCredentials({
    queries: {},
    protocols: {
      OID4VP: props.exchangeData.OID4VP, // vcapi currently ignored
    },
  });
  if (req.dataType === "OutOfBand") {
    loading.value = true;
    await checkStatus();
    intervalId = setInterval(checkStatus, 5000);
  }
};

const checkStatus = async () => {
  try {
    let exchange = {};
    ({
      data: { exchange },
    } = await httpClient.get("/exchange", {
      searchParams: {
        exchangeId: props.exchangeData.vcapi,
        clientId: props.rp.client_id
      },
    }));
    if (Object.keys(exchange).length > 0) {
      if (exchange.state === "complete") {
        const { verifiablePresentation } =
          exchange.variables.results["templated-vpr"];
        vp.value = verifiablePresentation;
        clearInterval(intervalId);
        loading.value = false;
      }
    } else {
      console.log("not complete");
    }
  } catch (error) {
    console.error("An error occurred while polling the endpoint:", error);
  }
};
</script>
<template>
  <div
    class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl px-16 lg:px-24 relative"
  >
    <h1
      class="text-3xl mb-12 text-center font-semibold"
      :style="{ color: theme.primary }"
    >
      {{ translations[defaultLanguage].login_cta }}
    </h1>
    <p class="mb-4" v-html="translations[defaultLanguage].login_explain"></p>
    <p
      class="mb-6"
      v-html="translations[defaultLanguage].app_install_explain"
    ></p>
    <div class="flex justify-center">
      <button
        v-if="!loading && !vp"
        @click="openChapi"
        class="text-white py-2 px-6 rounded-xl my-8"
        :style="{ background: theme.cta }"
      >
        {{ translations[defaultLanguage].app_cta }}
      </button>
      <div v-else-if="vp">
        <JsonView :data="{ vp }" title="Verified Credential" />
      </div>
      <div
        v-else
        class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] py-2 my-8 motion-reduce:animate-[spin_1.5s_linear_infinite]"
        :style="{ color: theme.primary }"
        role="status"
      >
        <span
          class="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]"
          >Loading...</span
        >
      </div>
    </div>
    <p
      class="text-center mb-2"
      v-html="translations[defaultLanguage].qr_explain"
    ></p>
    <p class="text-center">
      <button @click="switchView" :style="{ color: theme.primary }">
        {{ translations[defaultLanguage].qr_cta }}
      </button>
    </p>
  </div>
</template>
