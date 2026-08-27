/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {computed, onMounted, ref} from 'vue';
import {isSamsungBrowser} from '../../common/userAgent.js';
import {useQuasar} from 'quasar';

const dcApiSystemAvailable = ref(false);
let _dcApiChecked = false;

/**
 * Composable for platform detection and DC API availability.
 *
 * @returns {object} Platform info and DC API availability.
 */
export function usePlatform() {
  const $q = useQuasar();

  const platform = computed(() => ({
    isIOS: $q.platform?.is?.ios ?? false,
    isAndroid: $q.platform?.is?.android ?? false,
    isMobile: ($q.platform?.is?.ios ?? false) ||
      ($q.platform?.is?.android ?? false),
    isSamsungBrowser: typeof navigator !== 'undefined' &&
      isSamsungBrowser(navigator.userAgent)
  }));

  onMounted(() => {
    if(!_dcApiChecked) {
      dcApiSystemAvailable.value = !!(
        navigator.credentials && window.DigitalCredential !== undefined
      );
      _dcApiChecked = true;
    }
  });

  return {
    platform,
    dcApiSystemAvailable
  };
}
