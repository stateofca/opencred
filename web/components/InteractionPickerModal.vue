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
          v-for="option in availableOptions"
          :key="getOptionKey(option)"
          type="button"
          class="flex flex-col items-stretch p-3 rounded-md border-2
          transition-all text-left w-full"
          :class="isCurrentOption(option) ?
            'border-primary bg-primary/10' :
            'border-gray-300 hover:border-gray-400'"
          @click="handleSelect(option)">
          <div class="flex items-center justify-between">
            <span class="font-medium text-gray-900">
              {{getOptionLabel(option)}}
            </span>
            <span
              v-if="isCurrentOption(option)"
              class="text-sm text-primary">
              {{$t('interactionPicker_current')}}
            </span>
          </div>
          <p
            v-if="option.walletIds?.length > 0 && walletsRegistry"
            class="text-sm text-gray-500 mt-1 mb-0">
            {{getWalletNames(option.walletIds)}}
          </p>
        </button>
      </div>
    </q-card-section>
  </ModalDialog>
</template>

<script setup>
import ModalDialog from './ModalDialog.vue';
import {useI18n} from 'vue-i18n';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  availableOptions: {
    type: Array,
    default: () => []
  },
  currentOption: {
    type: Object,
    default: null
  },
  currentInteractionType: {
    type: String,
    default: null
  },
  walletsRegistry: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['update:modelValue', 'select']);

const {t} = useI18n({useScope: 'global'});

const getOptionKey = option => {
  const parts = [
    option.method, option.protocolId, option.walletId].filter(Boolean);
  return parts.join(':') || option.method;
};

const isCurrentOption = option => {
  if(props.currentOption) {
    return option.method === props.currentOption.method &&
      (option.protocolId || '') === (props.currentOption.protocolId || '') &&
      (option.walletId || '') === (props.currentOption.walletId || '');
  }
  if(props.currentInteractionType) {
    return option.method === props.currentInteractionType;
  }
  return false;
};

const getOptionLabel = option => {
  if(option.labelKey && t(option.labelKey) !== option.labelKey) {
    return t(option.labelKey);
  }
  if(option.protocolId) {
    const key = `interactionMethod_${option.method}_${option.protocolId}`;
    if(t(key) !== key) {
      return t(key);
    }
    const protocolKey = `protocols_${option.protocolId}_name`;
    if(t(protocolKey) !== protocolKey) {
      return `${t(`interactionMethod_${option.method}`) ||
       option.method} (${t(protocolKey)})`;
    }
  }
  if(option.walletId) {
    const key = `interactionMethod_${option.method}_${option.walletId}`;
    if(t(key) !== key) {
      return t(key);
    }
  }
  return t(`interactionMethod_${option.method}`) || option.method;
};

const getWalletNames = walletIds => {
  if(!Array.isArray(walletIds) || walletIds.length === 0 ||
   !props.walletsRegistry) {
    return '';
  }
  return walletIds.map(id => {
    const wallet = props.walletsRegistry[id];
    return wallet?.nameKey ? t(wallet.nameKey) : (wallet?.name || id);
  }).filter(Boolean).join(', ');
};

const handleSelect = option => {
  emit('select', option);
  emit('update:modelValue', false);
};
</script>
