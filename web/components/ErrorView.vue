<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div class="column items-center q-gutter-y-sm">
    <span class="text-body1 text-negative">
      {{title || $t('error_defaultTitle')}}
      {{subtitle || $t('error_defaultSubtitle')}}
    </span>

    <CadmvBanner
      variant="error"
      :dismissible="resettable"
      :text="message || $t('error_defaultMessage')"
      :dismiss-label="$t('exchangeReset')"
      @dismiss="$emit('reset')" />
  </div>
</template>

<script setup>
import {CadmvBanner} from '@digitalbazaar/cadmv-ui';

defineProps({
  title: {
    type: String,
    default: undefined
  },
  subtitle: {
    type: String,
    default: undefined
  },
  message: {
    type: String,
    default: undefined
  },
  resettable: {
    type: Boolean,
    default: () => false
  }
});

defineEmits(['reset']);
</script>
