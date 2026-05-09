<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div>
    <router-view />
  </div>
</template>

<script>
export default {
  name: 'App'
};
</script>

<style>
/* On mobile (<600px = Quasar's `xs` breakpoint) the main card is the
 * only thing on screen, so its border/shadow/rounded corners just
 * waste edge space and make the layout feel cramped. Drop the chrome
 * and let the content sit flush. The outer wrapper's q-pa-md still
 * provides the horizontal breathing room. This could be migrated into
 * cadmv-ui as a global style later. */
@media (max-width: 599.98px) {
  .opencred-main-card.q-card {
    box-shadow: none;
    border: none;
    border-radius: 0;
  }
  .opencred-hero-background {
    display: none;
  }
}
</style>
