/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  expandWalletAliases,
  WALLETS_REGISTRY
} from '../../common/wallets/index.js';
import {computed} from 'vue';
import {
  computeExchangeOptions
} from '../../common/wallets/exchange-options.js';
import {useExchangeContext} from './useExchangeContext.js';
import {useExchangeSettings} from './useExchangeSettings.js';
import {usePlatform} from './usePlatform.js';

/**
 * Composable that reactively computes exchange options
 * (picker entries, default/extra wallets/profiles) from
 * the current context, platform, and user settings.
 *
 * @returns {object} Reactive exchange options.
 */
export function useExchangeOptions() {
  const {context} = useExchangeContext();
  const {platform, dcApiSystemAvailable} = usePlatform();
  const {userSettings} = useExchangeSettings();

  const exchangeOptions = computed(() => {
    const ctx = context?.value;
    if(!ctx) {
      return null;
    }
    const wf = ctx.workflow || {};
    const walletIds = wf.wallets || ctx.options?.wallets;
    const systemWallets = expandWalletAliases(
      Array.isArray(walletIds) && walletIds.length > 0 ?
        walletIds : Object.keys(WALLETS_REGISTRY)
    );

    return computeExchangeOptions({
      workflow: wf,
      exchange: ctx.exchangeData || {},
      systemWallets,
      oid4vpDefaultProfile: ctx.options?.OID4VPdefault,
      userSettings: userSettings.value ||
        {enabledWallets: [], enabledProfiles: []},
      platform: platform.value || {},
      dcApiSystemAvailable: dcApiSystemAvailable.value || false
    });
  });

  const exchangeTtlDisplayThresholdSeconds = computed(() =>
    context?.value?.options?.exchangeTtlDisplayThresholdSeconds ?? 60
  );

  return {exchangeOptions, exchangeTtlDisplayThresholdSeconds};
}
