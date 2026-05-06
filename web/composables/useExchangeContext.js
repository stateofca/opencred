/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {computed, inject, provide} from 'vue';
import {
  expandWalletAliases,
  WALLETS_REGISTRY
} from '../../common/wallets/index.js';
import {
  computeExchangeOptions
} from '../../common/wallets/exchange-options.js';

const EXCHANGE_CTX = 'exchangeContext';

/**
 * Composable for sharing exchange context and computed exchange options.
 *
 * @param {object} [options] - Options object.
 * @param {import('vue').Ref<object>} [options.platform] - Reactive
 *   platform info `{isIOS, isAndroid, isMobile}`.
 * @param {import('vue').Ref<boolean>} [options.dcApiSystemAvailable]
 *   - Reactive DC API availability flag.
 * @returns {object} Context and derived values.
 */
export function useExchangeContext({platform, dcApiSystemAvailable} = {}) {
  const provideContext = ({context}) => provide(EXCHANGE_CTX, context);
  const context = inject(EXCHANGE_CTX, null);
  const userSettings = inject('userSettings', null);

  const workflow = computed(() => context?.value?.workflow);
  const translations = computed(() => workflow.value?.translations ?? {});
  const brand = computed(() => workflow.value?.brand ?? {});

  const exchangeOptions = computed(() => {
    const ctx = context?.value;
    if(!ctx || !platform || !dcApiSystemAvailable) {
      return null;
    }
    const wf = ctx.workflow || {};
    const walletIds = wf.wallets || ctx.options?.wallets;
    const systemWallets = expandWalletAliases(
      Array.isArray(walletIds) && walletIds.length > 0 ?
        walletIds : Object.keys(WALLETS_REGISTRY)
    );
    const settings = userSettings?.value ||
      {enabledWallets: [], enabledProfiles: []};

    return computeExchangeOptions({
      workflow: wf,
      exchange: ctx.exchangeData || {},
      systemWallets,
      oid4vpDefaultProfile: ctx.options?.OID4VPdefault,
      userSettings: settings,
      platform: platform.value || {},
      dcApiSystemAvailable: dcApiSystemAvailable.value || false
    });
  });

  return {
    provideContext,
    context,
    workflow,
    translations,
    brand,
    exchangeOptions
  };
}
