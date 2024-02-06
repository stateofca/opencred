<script setup>
  import {onBeforeMount, onMounted, reactive, ref} from 'vue';
  import {httpClient} from "@digitalbazaar/http-client";

  let props = defineProps({
    step: String,
    rp: {
      clientId: String,
      redirectUri: String,
      name: String,
      icon: String,
      backgroundImage: String,
      workflow: {
        id: String,
        type: String
      },
      theme: {
        cta: String,
        primary: String,
        header: String
      },
    },
    translations: Object,
    defaultLanguage: String,
    options: {
      exchangeProtocols: Array
    },
    exchangeData: {
      id: String,
      QR: String,
      vcapi: String,
      OID4VP: String,
      accessToken: String
    }
  })

  let intervalId;
  const vp = ref(null);
  const loading = ref(true);

  const state = reactive({
    currentUXMethodIndex: 0
  });

  onBeforeMount(async () => {
    const resp = await httpClient.get(`/context/login${window.location.search}`);
    console.log(resp.status)
    if (resp.status === 200) {
      props = resp.data;
      console.log(props);
      loading.value = false;
    }
    loading.value = false;
  })

  onMounted(async () => {
    intervalId = setInterval(checkStatus, 5000);

  })

  const switchView = () => {
    state.currentUXMethodIndex = (state.currentUXMethodIndex + 1) % props.options.exchangeProtocols.length;
  }

  const checkStatus = async () => {
    try {
      let exchange = {};
      ({
        data: { exchange },
      } = await httpClient.get(
        `/workflows/${props.rp.workflow.id}/exchanges/${props.exchangeData.id}`, 
        { headers: { Authorization: `Bearer ${props.exchangeData.accessToken}` } }
      ));
      if (Object.keys(exchange).length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const preventRedirect = urlParams.has('preventRedirect');
        if (exchange.state === "complete" && exchange.oidc?.code && !preventRedirect) {
          const queryParams = new URLSearchParams({
          state: props.exchangeData.oidc.state,
          code: exchange.oidc.code,
        });
        const destination = `${props.rp.redirectUri}?${queryParams.toString()}`;
        window.location.href = destination;
        clearInterval(intervalId);
      } else if (exchange.state === 'complete') {
          const { verifiablePresentation } =
            exchange.variables.results[exchange.step];
          vp.value = verifiablePresentation;
          clearInterval(intervalId);
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
  <div v-if="loading">Loading</div>
  <div v-else class="flex flex-col min-h-screen">
    <header class="" :style="{background: props.rp.theme.header}">
      <div class="mx-auto flex justify-between items-center px-6 py-3 max-w-3xl">
        <a :href="props.rp.redirectUri"
          class="flex items-center gap-3">
          <img :src="props.rp.icon" :alt="props.rp.name + 'Logo'" />
        </a>
        <button
          class="flex flex-row text-white items-center text-xs gap-3
                hover:underline">
          <span class="bg-white rounded-full p-1 flex">
            <img src="https://imagedelivery.net/I-hc6FAYxquPgv-npvTcWQ/505d9676-7f3a-49cc-bf9a-883439873d00/public" />
          </span>
          {{props.translations[props.defaultLanguage].translate}}
        </button>
      </div>
    </header>
    <main
      class="relative flex-grow">
      <div class="bg-white w-full text-center py-4">
        <h2 class="font-bold">Home</h2>
      </div>
      <div class="bg-no-repeat bg-cover clip-path-bg z-0 min-h-[360px]" 
        :style="{ 'background-image': `url(${props.rp.backgroundImage})` }">
        <div class="text-center text-6xl py-10">
          &nbsp;
        </div>
      </div>
      <div v-if="vp">
        <div class="flex justify-center">
          <JsonView :data="{ vp }" title="Verified Credential" />
        </div>
      </div>
      <ButtonView
        v-else-if="props.options.exchangeProtocols[state.currentUXMethodIndex] == 'chapi-button'"
        :chapiEnabled="true"
        :rp="props.rp"
        :translations="props.translations"
        :defaultLanguage="props.defaultLanguage"
        :options="props.options"
        :exchangeData="props.exchangeData"
        @switchView="switchView"/>
      <ButtonView
        v-else-if="props.options.exchangeProtocols[state.currentUXMethodIndex] == 'openid4vp-link'"
        :chapiEnabled="false"
        :rp="props.rp"
        :translations="props.translations"
        :defaultLanguage="props.defaultLanguage"
        :options="props.options"
        :exchangeData="props.exchangeData"
        @switchView="switchView"/>
      <QRView
        v-else-if="props.options.exchangeProtocols[state.currentUXMethodIndex] == 'openid4vp-qr'"
        :translations="props.translations"
        :theme="props.rp.theme"
        :defaultLanguage="props.defaultLanguage"
        :exchangeData="props.exchangeData"
        :options="props.options"
        @switchView="switchView"/>
    </main>
    <footer class="text-left p-3"
      v-html="props.translations[props.defaultLanguage].copyright">
    </footer>
  </div>
</template>

<style>

</style>
