<script setup>
// Necessary for grecaptcha
/* eslint-disable no-undef */
import {onMounted, ref} from 'vue';
import {config} from '@bedrock/web';

const props = defineProps({
  version: {
    type: String,
    required: true
  },
  siteKey: {
    type: String,
    required: true
  },
  action: {
    type: String,
    default: 'interaction'
  }
});

const emit = defineEmits(['verify', 'expired', 'error']);

const elementId = ref(`recaptcha-${Math.random().toString(36).substr(2, 9)}`);
const widgetId = ref(null);

onMounted(async () => {
  try {
    await loadReCaptchaScript();
    if(props.version === 3) {
      executeReCaptcha();
    } else {
      renderReCaptcha();
    }
  } catch(error) {
    console.error('Failed to load reCAPTCHA script:', error);
  }
});

function loadReCaptchaScript() {
  return new Promise((resolve, reject) => {
    if(document.getElementById('recaptcha-script')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = 'recaptcha-script';
    script.src =
      `https://www.google.com/recaptcha/api.js?hl=${config.defaultLanguage}`;
    if(props.version === 3) {
      script.src += `&render=${props.siteKey}`;
    }
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = error => reject(error);
    document.head.appendChild(script);
  });
}

function renderReCaptcha() {
  setTimeout(() => {
    if(typeof grecaptcha === 'undefined' ||
      typeof grecaptcha.render === 'undefined') {
      renderReCaptcha();
    } else {
      widgetId.value = grecaptcha.render(elementId.value, {
        sitekey: props.siteKey,
        callback: onVerify,
        'expired-callback': onExpired,
        'error-callback': onError
      });
    }
  }, 100);
}

function executeReCaptcha() {
  setTimeout(() => {
    if(typeof grecaptcha === 'undefined' ||
      typeof grecaptcha.render === 'undefined') {
      executeReCaptcha();
    } else {
      grecaptcha.ready(() => {
        grecaptcha.execute(props.siteKey, {action: props.action})
          .then(token => {
            emit('verify', token);
          })
          .catch(error => {
            emit('error', error);
          });
      });
    }
  }, 100);
}

function onVerify(response) {
  emit('verify', response);
}

function onExpired() {
  emit('expired');
}

function onError() {
  emit('error');
}
</script>

<template>
  <div :id="elementId" />
</template>
