<script setup>
  import {onMounted, reactive, ref} from 'vue';
  import {httpClient} from "@digitalbazaar/http-client";

  const props = defineProps({
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

  const state = reactive({
    isQROpen: false
  });

  onMounted(async () => {
    await checkStatus();
    intervalId = setInterval(checkStatus, 5000);
  })

  const switchView = () => {
    state.isQROpen = !state.isQROpen;
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
  <div class="flex flex-col min-h-screen">
    <header class="" :style="{background: rp.theme.header}">
      <div class="mx-auto flex justify-between items-center px-6 py-3 max-w-3xl">
        <a :href="rp.redirectUri"
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
        :style="{ 'background-image': `url(${rp.backgroundImage})` }">
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
        v-else-if="!state.isQROpen"
        :rp="rp"
        :translations="translations"
        :defaultLanguage="defaultLanguage"
        :exchangeData="exchangeData"
        @switchView="switchView"/>
      <QRView
        v-else
        :translations="translations"
        :theme="rp.theme"
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
  color: v-bind('rp.theme.primary')
}
</style>
