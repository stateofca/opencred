<script setup>
const props = defineProps({
  vp: {
    type: Object,
    default: () => ({})
  }
});
</script>

<template>
  <JsonView :data="props.vp" />
</template>
