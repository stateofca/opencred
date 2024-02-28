<script setup>
  import {onBeforeMount, onMounted, reactive, ref} from 'vue';
  import {config} from '@bedrock/web';
  import {httpClient} from "@digitalbazaar/http-client";
  import {setCssVar} from 'quasar';

  let intervalId;
  const vp = ref(null);
  const context = ref({
    rp: {
      brand: config.brand
    }
  });

  const state = reactive({
    currentUXMethodIndex: 0
  });

  onBeforeMount(async () => {
    const resp = await httpClient.get(`/context/login${window.location.search}`);
    if (resp.status === 200) {
      context.value = resp.data;
      if(resp.data.rp.brand) {
        Object.keys(resp.data.rp.brand).forEach(key => {
          setCssVar(key, resp.data.rp.brand[key]);
        });
      }
    }
  })

  onMounted(async () => {
    intervalId = setInterval(checkStatus, 5000);
  })

  const switchView = () => {
    state.currentUXMethodIndex = (state.currentUXMethodIndex + 1) % config.options.exchangeProtocols.length;
  }

  const checkStatus = async () => {
    try {
      let exchange = {};
      ({
        data: { exchange },
      } = await httpClient.get(
        `/workflows/${context.value.rp.workflow.id}/exchanges/${context.value.exchangeData.id}`, 
        { headers: { Authorization: `Bearer ${context.value.exchangeData.accessToken}` } }
      ));
      if (Object.keys(exchange).length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const preventRedirect = urlParams.has('preventRedirect');
        if (exchange.state === "complete" && exchange.oidc?.code && !preventRedirect) {
          const queryParams = new URLSearchParams({
          state: context.value.exchangeData.oidc.state,
          code: exchange.oidc.code,
        });
        const destination = `${context.value.rp.redirectUri}?${queryParams.toString()}`;
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
  <div class="flex flex-col min-h-screen">
    <header :style="{background: context.rp.brand.header}">
      <div class="mx-auto flex justify-between items-center px-6 py-3 max-w-3xl">
        <a :href="context.rp.redirectUri"
          class="flex items-center gap-3">
          <img v-if="context.rp.icon" :src="context.rp.icon" :alt="context.rp.name + 'Logo'" />
        </a>
        <button
          class="flex flex-row text-white items-center text-xs gap-3
                hover:underline">
          <span class="bg-white rounded-full p-1 flex">
            <img src="https://imagedelivery.net/I-hc6FAYxquPgv-npvTcWQ/505d9676-7f3a-49cc-bf9a-883439873d00/public" />
          </span>
          {{config.translations[config.defaultLanguage].translate}}
        </button>
      </div>
    </header>
    <main
      class="relative flex-grow">
      <div class="bg-white w-full text-center py-4">
        <h2 class="font-bold">Home</h2>
      </div>
      <div class="bg-no-repeat bg-cover clip-path-bg z-0 min-h-[360px]" 
        :style="{ 'background-image': `url(${context.rp.backgroundImage})`}">
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
        v-else-if="config.options.exchangeProtocols[state.currentUXMethodIndex] === 'chapi'"
        :chapiEnabled="true"
        :rp="context.rp"
        :translations="config.translations"
        :defaultLanguage="config.defaultLanguage"
        :options="config.options"
        :exchangeData="context.exchangeData"
        @switchView="switchView"/>
      <QRView
        v-else-if="config.options.exchangeProtocols[state.currentUXMethodIndex] === 'openid4vp'"
        :translations="config.translations"
        :brand="context.rp.brand"
        :defaultLanguage="config.defaultLanguage"
        :exchangeData="context.exchangeData"
        :options="config.options"
        @switchView="switchView"/>
    </main>
    <footer class="text-left p-3"
      v-html="config.translations[config.defaultLanguage].copyright">
    </footer>
  </div>
</template>

<style>
  a {
    color: var(--q-primary) !important;
    text-decoration: underline !important;
  }
</style>
