<!--
Copyright 2023 - 2025 California Department of Motor Vehicles
Copyright 2023 - 2025 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div>
    <div
      v-if="currentFields.length > 0"
      ref="mainContent"
      class="bg-white z-10 mx-auto p-10 rounded-md max-w-3xl
             px-16 lg:px-24 relative">
      <form
        @submit.prevent="requestSubmit">
        <h1
          class="text-center text-xl font-bold mb-3">
          Audit Verifiable Presentation
        </h1>
        <p class="required-asterisk mb-6">
          * Required
        </p>
        <div
          v-if="hasMultipleTypes"
          class="mb-5">
          <label
            for="auditType"
            class="font-md font-bold mr-5">
            Select audit configuration
          </label>
          <select
            id="auditType"
            v-model="selectedAuditTypeIndex"
            :disabled="hasEnteredData"
            class="col-6 font-md border rounded px-2 py-2 mr-5">
            <option
              v-for="(type, index) in auditTypes"
              :key="index"
              :value="index">
              {{type.name}}
            </option>
          </select>
          <button
            type="button"
            :disabled="!hasEnteredData"
            class="text-white py-2 px-4 rounded-xl"
            :style="{ background: '#0979c4' }"
            @click="resetAuditFields">
            Reset
          </button>
        </div>
        <div
          v-else-if="auditTypes.length === 1"
          class="mb-5">
          <p class="font-md font-bold">
            Audit Configuration: {{auditTypes[0].name}}
          </p>
        </div>
        <p class="text-lg mb-3">
          Please provide the Verifiable Presentation (vp token)
          that you would like to audit.
        </p>
        <div class="mb-5">
          <label
            for="vpToken"
            class="font-md font-bold mr-5">
            VP Token
            <span class="required-asterisk">*</span>
          </label>
          <button
            class="text-white py-2 px-2 my-8 mr-5 rounded-xl"
            :style="{ background: '#0979c4' }"
            @click="toggleVpTokenInputType">
            {{vpTokenInput.typeToggleButtonText}}
          </button>
        </div>
        <div class="row">
          <textarea
            v-if="vpTokenInput.type === 'textarea'"
            id="vpToken"
            v-model="vpTokenInput.data"
            rows="10"
            cols="50"
            class="col-8 px-2 py-2 mr-3 border rounded"
            required />
          <input
            v-else-if="vpTokenInput.type === 'filepicker'"
            id="vpToken"
            type="file"
            class="col-6"
            required
            @change="handleFileChange">
          <div
            v-if="auditResults.data.verified !== null && !auditResults.loading"
            class="col">
            <q-icon
              v-if="auditResults.data.verified"
              name="fas fa-circle-check"
              size="30px"
              color="green" />
            <q-icon
              v-else-if="!auditResults.data.verified"
              name="fas fa-circle-xmark"
              size="30px"
              color="red" />
          </div>
          <p
            v-if="auditResults.data.verified === false && !auditResults.loading"
            class="error-message font-bold pt-3">
            Error: {{auditResults.data.message}}
          </p>
        </div>
        <p class="text-lg mt-6 mb-3">
          Please provide the expected values for each of the
          following fields associated with this VP token.
        </p>
        <div class="container">
          <ul>
            <li
              v-for="field in currentFields"
              :key="field.id">
              <div
                :class="
                  Object.entries(auditResults.data.matches).length > 0 &&
                    !auditResults.data.matches[field.path] &&
                    !auditResults.loading ?
                      'row' :
                      'row mb-5'">
                <label
                  :for="[field.id]"
                  class="col-3 font-md font-bold mr-3">
                  {{field.name}}
                  <span
                    v-if="field.required"
                    class="required-asterisk">*</span>
                </label>
                <input
                  v-if="!NON_INPUT_TYPES.includes(field.type)"
                  :id="field.id"
                  v-model="auditFieldValues[field.path]"
                  :type="field.type"
                  class="col-6 font-md border rounded px-2 py-2 mr-5"
                  :required="field.required">
                <select
                  v-else-if="field.type === 'dropdown'"
                  v-model="auditFieldValues[field.path]"
                  class="col-6 font-md border rounded px-2 py-2 mr-5"
                  :required="field.required">
                  <option
                    disabled
                    value="">
                    Please select one
                  </option>
                  <option
                    v-for="option in Object.entries(field.options)"
                    :key="option[0]"
                    :value="option[1]">
                    {{option[0]}}
                  </option>
                </select>
                <div
                  v-if="Object.entries(auditResults.data.matches).length > 0 &&
                    !auditResults.loading"
                  class="col">
                  <q-icon
                    v-if="auditResults.data.matches[field.path]"
                    name="fas fa-circle-check"
                    size="30px"
                    color="green" />
                  <q-icon
                    v-else-if="!auditResults.data.matches[field.path]"
                    name="fas fa-circle-xmark"
                    size="30px"
                    color="red" />
                </div>
              </div>
              <p
                v-if="
                  Object.entries(auditResults.data.matches).length > 0 &&
                    !auditResults.data.matches[field.path] &&
                    !auditResults.loading"
                class="error-message font-bold pt-3 mb-5">
                Error: {{field.name}} does not match the value in the token
              </p>
            </li>
          </ul>
        </div>
        <input
          type="submit"
          class="centered-x text-white text-lg font-bold
            rounded-xl py-3 px-6 mt-5"
          :style="{ background: '#0979c4' }"
          :disabled="reCaptchaResults.loading || auditResults.loading">
      </form>
    </div>
    <div
      v-if="auditResults.loading"
      class="loading-overlay">
      <div
        class="inline-block h-20 w-20 py-2 my-8 animate-spin rounded-full
              border-4 border-solid border-current border-r-transparent
              motion-reduce:animate-[spin_1.5s_linear_infinite]
              align-[-0.125em]"
        :style="{ color: '#0979c4' }"
        role="status" />
    </div>
    <div
      v-if="reCaptchaResults.loading"
      class="recaptcha">
      <ReCaptcha
        :version="config.reCaptcha.version"
        :site-key="config.reCaptcha.siteKey"
        action="audit"
        @verify="onReCaptchaVerify"
        @expired="onReCaptchaExpired"
        @error="onReCaptchaError" />
    </div>
  </div>
</template>

<script setup>
import {computed, ref, watch} from 'vue';
import {config} from '@bedrock/web';
import {httpClient} from '@digitalbazaar/http-client';
import {QIcon} from 'quasar';
import ReCaptcha from '../components/ReCaptcha.vue';

const NON_INPUT_TYPES = ['dropdown'];

const enableAuditReCaptcha = config.reCaptcha.pages.includes('audit');

const getDefaultValueForField = f => {
  if(f.type == 'dropdown') {
    return f.default ?
      Object.entries(f.options ?? []).find(
        v => v[0] == f.default)?.[1] :
      undefined;
  }
  return f.default ?? undefined;
};

const mainContent = ref(null);

// Audit type selection state
const auditTypes = computed(() => config.audit.types || []);
const selectedAuditTypeIndex = ref(
  auditTypes.value.length > 0 ? 0 : null
);
const hasMultipleTypes = computed(() => auditTypes.value.length > 1);
const selectedAuditType = computed(() => {
  if(selectedAuditTypeIndex.value === null ||
    selectedAuditTypeIndex.value >= auditTypes.value.length) {
    return null;
  }
  return auditTypes.value[selectedAuditTypeIndex.value];
});
const currentFields = computed(() => selectedAuditType.value?.fields || []);

// Cache for field values to maintain state across type changes
const fieldValuesCache = ref({});

// Computed auditFieldValues based on selected type
const auditFieldValues = computed({
  get() {
    if(!selectedAuditType.value) {
      return {};
    }
    return Object.fromEntries(
      selectedAuditType.value.fields.map(f => [
        f.path,
        fieldValuesCache.value[f.path] ?? getDefaultValueForField(f)
      ])
    );
  },
  set(newValue) {
    // Update cache when values change
    fieldValuesCache.value = {...newValue};
  }
});

// Track if any data has been entered (compared to defaults)
const hasEnteredData = computed(() => {
  if(!selectedAuditType.value) {
    return false;
  }
  // Check if any field value differs from its default
  return selectedAuditType.value.fields.some(field => {
    const defaultValue = getDefaultValueForField(field);
    const currentValue = fieldValuesCache.value[field.path] ?? defaultValue;
    // Compare values - if they differ, data has been entered
    return currentValue !== defaultValue;
  });
});

const vpTokenInput = ref({
  data: '',
  type: 'filepicker',
  typeToggleButtonText: 'Switch to text input'
});

const auditResults = ref({
  data: {
    verified: null,
    matches: {},
    message: ''
  },
  loading: false
});

const reCaptchaResults = ref({
  loading: false,
  verified: enableAuditReCaptcha ?
    false :
    true,
  token: null
});

function onReCaptchaVerify(response) {
  reCaptchaResults.value.verified = true;
  reCaptchaResults.value.token = response;
  reCaptchaResults.value.loading = false;
  auditPresentation();
}

function onReCaptchaExpired() {
  reCaptchaResults.value.loading = false;
  reCaptchaResults.value.verified = false;
  reCaptchaResults.value.token = null;
}

function onReCaptchaError() {
  reCaptchaResults.value.loading = false;
  reCaptchaResults.value.verified = false;
  reCaptchaResults.value.token = null;
}

function toggleVpTokenInputType() {
  vpTokenInput.value.type =
    vpTokenInput.value.type === 'textarea' ?
      'filepicker' :
      'textarea';
  vpTokenInput.value.typeToggleButtonText =
    vpTokenInput.value.typeToggleButtonText === 'Switch to file picker' ?
      'Switch to text input' :
      'Switch to file picker';
  vpTokenInput.value.data = '';
}

function handleFileChange(event) {
  const file = event.target.files[0];
  const reader = new FileReader();
  reader.onload = res => {
    vpTokenInput.value.data = res.target.result;
  };
  reader.onerror = err => alert(err?.message || err);
  reader.readAsText(file);
}

async function requestSubmit() {
  // prevent double submission
  if(reCaptchaResults.value.loading) {
    return;
  }

  // disable button while checking
  reCaptchaResults.value.loading = true;
  reCaptchaResults.value.verified = false;
  clearAuditResults();
}

async function auditPresentation() {
  // Prevent submission if recaptcha is still going
  if(!reCaptchaResults.value.verified) {
    return;
  }

  let response;
  try {
    response = await httpClient.post(
      '/audit-presentation', {
        json: {
          vpToken: vpTokenInput.value.data.replace(/\s+/g, ''),
          fields: auditFieldValues.value,
          reCaptchaToken: reCaptchaResults.value.token
        }
      }
    );
    auditResults.value.data = response.data;
  } catch(error) {
    auditResults.value.data = error.data;
  } finally {
    auditResults.value.loading = false;
    mainContent.value.scrollIntoView({behavior: 'smooth'});
  }
}

function clearAuditResults() {
  auditResults.value = {
    data: {
      verified: null,
      matches: {},
      message: ''
    },
    loading: false
  };
}

function resetAuditFields() {
  // Clear the cache to reset all field values to defaults
  fieldValuesCache.value = {};
}

// Watch for type changes and clear field values (but not vpTokenInput)
watch(selectedAuditTypeIndex, () => {
  fieldValuesCache.value = {};
});
</script>

<style>
.centered-x {
  position: relative;
  left: 50%;
  transform: translate(-50%, -0%);
}
.font-md {
  width: 200px;
  font-size: medium;
}
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}
.error-message {
  color: red;
  max-width: 500px;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.required-asterisk {
  color: red;
  font-weight: bold;
}
.recaptcha {
  position: fixed;
  bottom: 10%;
  right: 10%
}
</style>
