<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<script setup>
import CheckDecagramIcon from 'vue-material-design-icons/CheckDecagram.vue';
import {onMounted} from 'vue';

const props = defineProps({
  exchange: {
    type: Object,
    default: () => ({})
  },
  rp: {
    type: Object,
    default: () => ({})
  }
});

onMounted(async () => {
  const queryParams = new URLSearchParams({
    state: props.exchange.oidc.state,
    code: props.exchange.oidc.code,
  });
  const destination = `${props.rp.redirectUri}?${queryParams.toString()}`;
  window.location.href = destination;
});

</script>

<template>
  <div
    class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
           px-16 lg:px-24 relative">
    <div class="mx-auto py-24 flex items-center justify-center gap-5 text-xl">
      <check-decagram-icon
        fill-color="green"
        size="60" />
    </div>
  </div>
</template>
