<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <q-dialog
    :model-value="modelValue"
    :persistent="persistent"
    @update:model-value="handleUpdate">
    <q-card
      class="modal-content"
      @click.stop>
      <slot />
    </q-card>
  </q-dialog>
</template>

<script setup>
defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  persistent: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue', 'close']);

const handleUpdate = value => {
  emit('update:modelValue', value);
  if(!value) {
    emit('close');
  }
};
</script>
