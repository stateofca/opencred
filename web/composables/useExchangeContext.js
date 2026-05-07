/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {computed, onBeforeMount, ref, watch} from 'vue';
import {config} from '@bedrock/web';
import {httpClient} from '@digitalbazaar/http-client';
import {setCssVar} from 'quasar';
import {useRoute} from 'vue-router';

const context = ref({
  workflow: {brand: {}},
  initError: null
});

const _hasLoaded = ref(false);
const _loading = ref(false);
const _loadedForRouteKey = ref(null);

function _invalidateContext() {
  _hasLoaded.value = false;
  _loadedForRouteKey.value = null;
}

function _setDefaultBrand() {
  if(!_hasLoaded.value && !_loading.value) {
    context.value.workflow.brand = config?.brand ?? {};
  }
}

async function _loadContext({routeName, exchangeToken}) {
  _setDefaultBrand();
  if(_loading.value) {
    return;
  }
  if(!routeName || routeName === 'Audit Presentation') {
    return;
  }

  const routeKey = `${routeName}:${exchangeToken || ''}`;
  if(_hasLoaded.value && _loadedForRouteKey.value === routeKey) {
    return;
  }

  try {
    _loading.value = true;
    let url;
    if(exchangeToken) {
      url = `/context/continue?exchange_token=${encodeURIComponent(
        exchangeToken)}`;
    } else {
      url = `/context/${routeName}${window.location.search}`;
    }
    const {data} = await httpClient.get(url);
    context.value = data;
    context.value.initError = null;
    _hasLoaded.value = true;
    _loadedForRouteKey.value = routeKey;
    if(data.workflow?.brand) {
      for(const key in data.workflow.brand) {
        if(typeof data.workflow.brand[key] === 'string') {
          setCssVar(key, data.workflow.brand[key]);
        }
      }
      if(data.workflow.brand.header) {
        setCssVar('primary', data.workflow.brand.header);
      }
    }
  } catch(e) {
    if(e.data?.message) {
      context.value.initError = {
        message: e.data.message
      };
    } else {
      console.error('Failed to fetch context:', e);
    }
  }
  _loading.value = false;
}

/**
 * Composable for shared exchange context. Module-level singleton;
 * fetches context via HTTP based on the current route.
 *
 * @returns {object} Exchange context and derived values.
 */
export function useExchangeContext() {
  const route = useRoute();

  const workflow = computed(() => context.value?.workflow ?? null);
  const translations = computed(() => workflow.value?.translations ?? {});
  const brand = computed(() => workflow.value?.brand ?? {});
  const exchangeData = computed(() => context.value?.exchangeData ?? {});
  const exchangeState = computed(
    () => exchangeData.value?.state ?? 'pending');
  const options = computed(() => context.value?.options ?? {});

  onBeforeMount(async () => {
    await _loadContext({
      routeName: route.name,
      exchangeToken: route.query?.exchange_token
    });
  });

  watch(() => [route.name, route.query?.exchange_token], async () => {
    _invalidateContext();
    context.value.workflow.brand = config?.brand ?? {};
    await _loadContext({
      routeName: route.name,
      exchangeToken: route.query?.exchange_token
    });
  });

  const updateExchange = updatedExchange => {
    context.value.exchangeData = {
      ...context.value.exchangeData,
      ...updatedExchange
    };
  };

  return {
    context,
    workflow,
    translations,
    brand,
    exchangeData,
    exchangeState,
    options,
    updateExchange
  };
}
