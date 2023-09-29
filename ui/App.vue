<template>
  <AppMain
    :step="ctx.step"
    :rp="ctx.rp"
    :translations="ctx.translations"
    :defaultLanguage="ctx.defaultLanguage"
    :theme="ctx.theme"
    :exchangeData="ctx.exchangeData"/>
</template>

<script setup>
  import { useSSRContext } from 'vue'
  import './styles.css';

  // Populate data from SSR on server side or from script in <head> on client.
  let ctx = {};
  if (import.meta.env.SSR) {
    ctx = useSSRContext();
  }
  else {
    ctx = window && window.ctx;
  }
</script>

<style>
</style>
