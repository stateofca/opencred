/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {computed, inject, provide} from 'vue';

const EXCHANGE_CTX = 'exchangeContext';

export function useExchangeContext() {
  const provideContext = ({context}) => provide(EXCHANGE_CTX, context);
  const context = inject(EXCHANGE_CTX, null);

  const workflow = computed(() => context.value.workflow);
  const translations = computed(() => workflow.value?.translations ?? {});
  const brand = computed(() => workflow.value?.brand ?? {});

  return {
    provideContext,
    context,
    workflow,
    translations,
    brand
  };
}
