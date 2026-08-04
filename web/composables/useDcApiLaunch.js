/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {httpClient} from '@digitalbazaar/http-client';
import {reactive} from 'vue';
import {startDcApiFlow} from '../utils/dcapi.js';
import {useExchange} from './useExchange.js';

// Module-level singleton, matching `useWalletInteraction`: the launch state
// belongs to the one exchange the page is showing, not to a component instance.
// Reset on exchange change — see `reset`.
const launchState = reactive({
  // Which launch option is in flight, so only the pressed button shows a
  // loading state rather than every button on the screen.
  activeDescriptorId: null,
  error: null
});

/**
 * Composable owning DC API launch state.
 *
 * A launch takes a launch-option descriptor and offers **all** of its profiles
 * to the platform in one call, which is what lets one button reach wallets that
 * read different formats.
 *
 * @returns {object} Launch state and controls.
 */
export function useDcApiLaunch() {
  const {exchangeData, updateExchange} = useExchange();

  const launch = async descriptor => {
    const profiles = descriptor?.profiles;
    if(!Array.isArray(profiles) || profiles.length === 0) {
      throw new Error('A launch option must request at least one profile');
    }

    launchState.error = null;
    launchState.activeDescriptorId = descriptor.id ?? null;
    try {
      await startDcApiFlow({
        exchangeData: exchangeData.value,
        httpClient,
        profiles,
        onExchangeUpdate: updatedExchange => {
          updateExchange(updatedExchange);
        }
      });
    } catch(error) {
      console.error('DC API flow error:', {profiles}, error);
      launchState.error = {
        message: error.message ||
          'An error occurred while starting the DC API flow.'
      };
    } finally {
      launchState.activeDescriptorId = null;
    }
  };

  const reset = () => {
    launchState.activeDescriptorId = null;
    launchState.error = null;
  };

  return {launchState, launch, reset};
}
