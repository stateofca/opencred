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
    :src="explainerVideoLink"
    frameborder="0"
    allow="autoplay"
    allowfullscreen />
</template>

<style scoped>
iframe {
  aspect-ratio: 9/16;
  height: 70vh;
}
</style>
