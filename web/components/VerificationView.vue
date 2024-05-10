<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<script setup>
import CheckDecagramIcon from 'vue-material-design-icons/CheckDecagram.vue';
</script>

<template>
  <div
    class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
           px-16 lg:px-24 relative">
    <div class="mx-auto py-24 flex items-center justify-center gap-5 text-xl">
      <check-decagram-icon
        fill-color="green"
        size="60" />
      {{$t('verificationSuccess')}}
    </div>
  </div>
</template>
