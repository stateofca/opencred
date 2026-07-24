<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div
    v-if="hasContent"
    class="column items-center q-gutter-y-sm text-center">
    <p
      v-if="te('verificationSuccessMessage')"
      class="text-base q-mb-md">
      {{t('verificationSuccessMessage')}}
    </p>
    <dl
      v-if="fields.length"
      class="column q-gutter-y-xs q-ma-none">
      <div
        v-for="(field, index) in fields"
        :key="index"
        class="row items-baseline justify-center">
        <dt
          v-if="fieldLabel(field)"
          class="text-weight-medium q-mr-md">
          {{fieldLabel(field)}}:
        </dt>
        <dd class="q-ma-none">
          {{displayValue(field.value)}}
        </dd>
      </div>
    </dl>
  </div>
</template>

<script setup>
import {computed} from 'vue';
import {useReactiveI18n} from '../composables/useReactiveI18n.js';

const props = defineProps({
  fields: {
    type: Array,
    default: () => []
  }
});

const {t, te} = useReactiveI18n();

const hasContent = computed(
  () => te('verificationSuccessMessage') || props.fields.length > 0);

/**
 * Resolve a field's display label. Prefers `labelKey` when it resolves in the
 * current locale, else the literal `label`, else no label.
 *
 * @param {object} field - A resolved field ({label?, labelKey?, value}).
 * @returns {string} The label to display, or '' when none.
 */
const fieldLabel = field => {
  if(field.labelKey && te(field.labelKey)) {
    return t(field.labelKey);
  }
  if(field.label) {
    return field.label;
  }
  return '';
};

/**
 * Render a field value as text.
 *
 * @param {*} value - The resolved value.
 * @returns {string} A string representation.
 */
const displayValue = value => {
  if(typeof value === 'string') {
    return value;
  }
  if(value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};
</script>
