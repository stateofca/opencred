/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {computed} from 'vue';
import {useExchangeContext} from './useExchangeContext.js';
import {useExchangeOptions} from './useExchangeOptions.js';
import {useExchangeSettings} from './useExchangeSettings.js';
import {usePlatform} from './usePlatform.js';
import {useWalletInteraction} from './useWalletInteraction.js';

/**
 * Facade composable that combines exchange context, platform,
 * settings, options, and interaction state into a single import.
 *
 * @returns {object} Combined exchange state.
 */
export function useExchange() {
  const exchangeContext = useExchangeContext();
  const {platform, dcApiSystemAvailable} = usePlatform();
  const {userSettings, reloadSettings} = useExchangeSettings();
  const {exchangeOptions} = useExchangeOptions();
  const {interactionState} = useWalletInteraction();

  const {exchangeState} = exchangeContext;

  const isActive = computed(() => {
    return exchangeState.value === 'active' &&
      !interactionState.activeOverride;
  });

  return {
    ...exchangeContext,
    platform,
    dcApiSystemAvailable,
    userSettings,
    reloadSettings,
    exchangeOptions,
    interactionState,
    isActive
  };
}
