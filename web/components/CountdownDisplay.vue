<template>
  <span>
    <template v-if="remainingSeconds > 89">
      {{Math.round(remainingSeconds / 60)}}
      minutes
    </template>
    <template v-else>
      {{remainingSeconds}} seconds
    </template>
  </span>
</template>

<script setup>
import {onMounted, onUnmounted, ref} from 'vue';

// Props
const props = defineProps({
  createdAt: {
    type: String,
    required: true,
  },
  ttl: {
    type: Number,
    required: true,
  },
});

// Refs for time tracking
const remainingSeconds = ref(0);
let intervalId = null;

// Helper function to calculate remaining time
function updateRemaining(createdAt, ttl) {
  const createdTime = new Date(createdAt).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - createdTime) / 1000);
  remainingSeconds.value = Math.max(ttl - elapsed, 0);
}

// Initialize and update every second
onMounted(() => {
  updateRemaining(props.createdAt, props.ttl);
  intervalId = setInterval(() => {
    updateRemaining(props.createdAt, props.ttl);
  }, 1000);
});

// Clean up on unmount
onUnmounted(() => {
  if(intervalId) {
    clearInterval(intervalId);
  }
});
</script>
