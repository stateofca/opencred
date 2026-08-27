<template>
  <p
    v-if="showCountdown"
    :class="['text-gray-900 mt-4', wrapperClass]">
    {{$t('exchangeActiveExpiryMessage')}}
    <template v-if="remainingSeconds > 89">
      {{Math.round(remainingSeconds / 60)}}
      {{$t('exchangeActiveExpiryMinutes')}}
    </template>
    <template v-else>
      {{remainingSeconds}} {{$t('exchangeActiveExpirySeconds')}}
    </template>
  </p>
</template>

<script setup>
import {computed, onMounted, onUnmounted, ref} from 'vue';
import {getSecondsUntilExpires} from '../utils/exchange-expiry.js';
import {useI18n} from 'vue-i18n';

useI18n({useScope: 'global'});

const props = defineProps({
  expires: {
    type: String,
    default: null
  },
  displayThreshold: {
    type: Number,
    default: 60
  },
  wrapperClass: {
    type: String,
    default: ''
  }
});

const now = ref(Date.now());
let intervalId = null;

const remainingSeconds = computed(() =>
  getSecondsUntilExpires({expires: props.expires, now: now.value})
);

const showCountdown = computed(() =>
  remainingSeconds.value !== null &&
  remainingSeconds.value > 0 &&
  remainingSeconds.value < props.displayThreshold
);

onMounted(() => {
  intervalId = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if(intervalId) {
    clearInterval(intervalId);
  }
});
</script>
