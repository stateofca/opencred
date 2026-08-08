<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <ModalDialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)">
    <q-card-section>
      <h3 class="text-lg font-semibold mb-4 text-gray-900">
        {{$t('interactionPicker_chooseHowToConnect')}}
      </h3>
      <div class="flex flex-col gap-2">
        <button
          v-for="entry in pickerEntries"
          :key="getEntryKey(entry)"
          type="button"
          class="flex flex-col items-stretch p-3 rounded-md border-2
          transition-all text-left w-full"
          :class="isCurrentEntry(entry) ?
            'border-primary bg-primary/10' :
            'border-gray-300 hover:border-gray-400'"
          @click="handleSelect(entry)">
          <div class="flex items-center justify-between">
            <span class="font-medium text-gray-900">
              {{getEntryLabel(entry)}}
            </span>
            <span
              v-if="isCurrentEntry(entry)"
              class="text-body2 text-primary q-pl-sm text-no-wrap">
              {{$t('interactionPicker_current')}}
            </span>
          </div>
          <p
            v-if="getEntryDescription(entry)"
            class="text-sm text-gray-500 mt-1 mb-0">
            {{getEntryDescription(entry)}}
          </p>
        </button>
      </div>
    </q-card-section>
  </ModalDialog>
</template>

<script setup>
import ModalDialog from './ModalDialog.vue';
import {resolveDeviceContextName} from '../../common/wallets/index.js';
import {useI18n} from 'vue-i18n';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  pickerEntries: {
    type: Array,
    default: () => []
  },
  currentEntry: {
    type: Object,
    default: null
  },
  walletsRegistry: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['update:modelValue', 'select']);

const {t} = useI18n({useScope: 'global'});

const getEntryKey = entry => {
  const parts = [entry.method, entry.profile].filter(Boolean);
  return parts.join(':') || entry.method;
};

const isCurrentEntry = entry => {
  if(!props.currentEntry) {
    return false;
  }
  return entry.method === props.currentEntry.method &&
    (entry.profile || null) === (props.currentEntry.profile || null);
};

// The label says what the user DOES; the description line (getEntryDescription)
// says which of their wallets it works with. So the label is the plain
// interaction-method string and never composes in the technical profile name —
// a per-option `labelKey` override or an explicit per-(method, profile) key can
// still set it, but there is no `method (profile-name)` fallback.
const getEntryLabel = entry => {
  if(entry.labelKey && t(entry.labelKey) !== entry.labelKey) {
    return t(entry.labelKey);
  }
  if(entry.method === 'dcapi' && entry.profile === null) {
    return t('interactionMethod_dcapi');
  }
  if(entry.profile) {
    const composite =
      `interactionMethod_${entry.method}_${entry.profile}`;
    if(t(composite) !== composite) {
      return t(composite);
    }
  }
  return t(`interactionMethod_${entry.method}`) || entry.method;
};

const getWalletNames = walletIds => {
  if(!Array.isArray(walletIds) || walletIds.length === 0 ||
   !props.walletsRegistry) {
    return '';
  }
  return walletIds.map(id => {
    const wallet = props.walletsRegistry[id];
    return resolveDeviceContextName({wallet, t, fallbackId: id});
  }).filter(Boolean).join(', ');
};

const getEntryDescription = entry => {
  if(entry.method === 'dcapi' && entry.profile === null) {
    return t('interactionPicker_dcapiAggregatorDescription');
  }
  return getWalletNames(entry.walletIds);
};

const handleSelect = entry => {
  emit('select', entry);
  emit('update:modelValue', false);
};
</script>
