<template>
  <span>{{friendlyTime}}</span>
</template>

<script setup>
import {computed, ref} from 'vue';

const props = defineProps({
  ttl: {
    type: Number,
    required: true
  },
  createdAt: {
    type: String,
    required: true
  }
});

const friendlyTime = computed(() => {
  const timeLeft = ref(Math.floor(
    (new Date(props.createdAt).getTime() +
    props.ttl * 1000 - Date.now()) / 1000));

  if(timeLeft.value <= 0) {
    return 'expired';
  }
  if(timeLeft.value >= 7200) { // 2 hours in seconds
    const hours = Math.ceil(timeLeft.value / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  if(timeLeft.value >= 60) {
    const minutes = Math.ceil(timeLeft.value / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else {
    return `${timeLeft.value} second${timeLeft.value !== 1 ? 's' : ''}`;
  }
});
</script>
