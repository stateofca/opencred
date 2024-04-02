<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<script setup>
import {computed} from 'vue';

const props = defineProps({
  id: {
    type: String,
    required: true
  }
});

const explainerVideoLink = computed(() =>
  'https://www.youtube.com/embed/' + props.id + '?autoplay=1' +
  '&controls=0&loop=1&playlist=' + props.id
);
</script>

<template>
  <iframe
    width="250"
    height="542"
    :src="explainerVideoLink"
    frameborder="0"
    allow="autoplay"
    allowfullscreen />
</template>
