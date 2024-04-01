<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<script setup>
import CheckCircleIcon from 'vue-material-design-icons/CheckCircle.vue';
import CloseCircleIcon from 'vue-material-design-icons/CloseCircle.vue';
import {config} from '@bedrock/web';
import {httpClient} from '@digitalbazaar/http-client';
import {ref} from 'vue';

const auditFieldValues = ref(
  Object.fromEntries(
    config.auditFields
      .map(f => [f.path, null])
  )
);

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

async function auditPresentation() {
  clearAuditResults();
  auditResults.value.loading = true;
  let response;
  try {
    response = await httpClient.post(
      '/audit-presentation', {
        json: {
          vpToken: vpTokenInput.value.data,
          fields: auditFieldValues.value
        }
      }
    );
    auditResults.value.data = response.data;
  } catch(error) {
    auditResults.value.data = error.data;
  } finally {
    auditResults.value.loading = false;
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
</script>

<template>
  <div class="flex flex-col">
    <main
      class="main relative flex-grow mt-20">
      <form
        v-if="config.auditFields && config.auditFields.length > 0"
        class="px-6 py-8 border rounded"
        @submit.prevent="auditPresentation">
        <h1 class="text-center text-xl font-bold">
          Audit Verifiable Presentation
        </h1>
        <p class="text-lg mt-6 mb-3">
          Please provide the VP token
          that you would like to audit.
        </p>
        <div class="mb-5">
          <label
            for="vpToken"
            class="font-md font-bold mr-5">
            VP Token
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
            <check-circle-icon
              v-if="auditResults.data.verified"
              fill-color="green"
              size="30" />
            <close-circle-icon
              v-else-if="!auditResults.data.verified"
              fill-color="red"
              size="30" />
          </div>
        </div>
        <p
          v-if="auditResults.data.verified === false && !auditResults.loading"
          class="error-message font-bold pt-3">
          Error: {{auditResults.data.message}}
        </p>
        <p class="text-lg mt-6 mb-3">
          Please provide the proper values for each of the
          following fields associated with this VP token.
        </p>
        <div class="container">
          <ul>
            <li
              v-for="field in config.auditFields"
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
                  class="col-2 font-md font-bold mr-3">
                  {{field.name}}
                </label>
                <input
                  :id="field.id"
                  v-model="auditFieldValues[field.path]"
                  :type="field.type"
                  class="col-6 font-md border rounded px-2 py-2 mr-5"
                  required>
                <div
                  v-if="Object.entries(auditResults.data.matches).length > 0 &&
                    !auditResults.loading"
                  class="col">
                  <check-circle-icon
                    v-if="auditResults.data.matches[field.path]"
                    fill-color="green"
                    size="30" />
                  <close-circle-icon
                    v-else-if="!auditResults.data.matches[field.path]"
                    fill-color="red"
                    size="30" />
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
          :style="{ background: '#0979c4' }">
      </form>
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
    </main>
    <footer
      class="footer text-left p-3"
      v-html="config.translations[config.defaultLanguage].copyright" />
  </div>
</template>

<style>
.main {
  display: flex;
  justify-content: center;
  align-self: center;
  align-items: center;
  max-width: 75%;
}
.footer {
  position: fixed;
  bottom: 5px;
  left: 5px
}
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
  max-width: 55%;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
</style>
