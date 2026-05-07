/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {onMounted, ref} from 'vue';
import {loadUserSettings} from '../../common/wallets/canShowOption.js';

const userSettings = ref({enabledWallets: [], enabledProfiles: []});
let _loaded = false;

/**
 * Composable for user settings (localStorage). Module-level singleton.
 *
 * @returns {object} Reactive user settings and reload function.
 */
export function useExchangeSettings() {
  const reloadSettings = () => {
    userSettings.value = loadUserSettings();
  };

  onMounted(() => {
    if(!_loaded) {
      reloadSettings();
      _loaded = true;
    }
  });

  return {userSettings, reloadSettings};
}
