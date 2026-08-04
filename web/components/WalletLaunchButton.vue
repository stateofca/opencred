<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <!-- Render as link when href is provided -->
  <a
    v-if="href"
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    :class="[
      noFullWidth ? '' : 'w-full',
      disabled ?
        'opacity-50 cursor-not-allowed pointer-events-none'
        : 'cursor-pointer'
    ]">
    <cadmv-button
      variant="primary"
      :disabled="disabled"
      :class="noFullWidth ? '' : 'w-full'">
      <div class="flex items-center gap-3 flex-grow min-w-0 overflow-hidden">
        <span class="font-medium text-center truncate min-w-0 flex-grow">
          {{label || (wallet?.nameKey ? $t(wallet.nameKey)
            : (wallet?.name || walletId))}}
        </span>
        <q-icon
          v-if="copyOnly"
          name="content_copy"
          size="24px"
          class="flex-shrink-0 text-current" />
      </div>
    </cadmv-button>
  </a>
  <!-- Render as button when href is not provided (DC API mode) -->
  <cadmv-button
    v-else
    variant="primary"
    :loading="loading"
    :disabled="disabled"
    :class="[
      noFullWidth ? '' : 'w-full',
      noFullWidth ? '' : 'mx-auto'
    ]"
    @click="handleClick">
    <div class="flex items-center gap-3 flex-grow min-w-0 overflow-hidden">
      <span class="font-medium text-center truncate min-w-0 flex-grow">
        {{label || (wallet?.nameKey ? $t(wallet.nameKey)
          : (wallet?.name || walletId))}}
      </span>
      <q-icon
        v-if="copyOnly"
        name="content_copy"
        size="24px"
        class="flex-shrink-0 text-current" />
    </div>
  </cadmv-button>
</template>

<script setup>
import {CadmvButton} from '@digitalbazaar/cadmv-ui';

const props = defineProps({
  wallet: {
    type: Object,
    default: null
  },
  // May be null in single-profile mode (no specific wallet targeted).
  walletId: {
    type: String,
    default: null
  },
  // Optional: a launch option may request several profiles together, in which
  // case there is no single profile to name. The parent decides what a press
  // means; this stays presentational.
  profile: {
    type: String,
    default: null
  },
  label: {
    type: String,
    default: null
  },
  href: {
    type: String,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  copyOnly: {
    type: Boolean,
    default: false
  },
  noFullWidth: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['launch', 'copy']);

const handleClick = () => {
  const payload = {
    walletId: props.walletId,
    profile: props.profile
  };
  if(props.copyOnly) {
    emit('copy', payload);
  } else {
    emit('launch', payload);
  }
};
</script>
