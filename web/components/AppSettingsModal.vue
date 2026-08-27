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
        {{$t('appSettings_title')}}
      </h3>

      <!-- Wallets section -->
      <section class="mb-6">
        <h4 class="text-sm font-medium mb-2 text-gray-700">
          {{$t('appSettings_wallets')}}
        </h4>

        <!-- Defaults (locked) -->
        <p
          v-if="opts.defaultWallets.length > 0"
          class="text-xs text-gray-500 mt-2 mb-1">
          {{$t('appSettings_walletsDefaultsHeading')}}
        </p>
        <div class="flex flex-col gap-2">
          <label
            v-for="row in opts.defaultWallets"
            :key="row.walletId"
            class="flex items-start gap-2 opacity-90">
            <input
              type="checkbox"
              checked
              disabled
              class="rounded mt-0.5">
            <div class="flex flex-col">
              <span class="text-gray-900">
                {{walletLabel(row)}}
                <span class="text-xs text-gray-500">
                  {{$t('appSettings_lockedHint')}}
                </span>
              </span>
              <span class="text-xs text-gray-600 mt-0.5">
                {{$t('appSettings_addsLabel', {
                  methods: methodSummary(row.supportedMethods)
                })}}
              </span>
            </div>
          </label>
        </div>

        <!-- Extras (toggleable) -->
        <p class="text-xs text-gray-500 mt-3 mb-1">
          {{$t('appSettings_walletsExtrasHeading')}}
        </p>
        <p
          v-if="opts.extraWallets.length === 0"
          class="text-xs text-gray-500">
          {{$t('appSettings_walletsExtrasEmpty')}}
        </p>
        <div
          v-else
          class="flex flex-col gap-2">
          <label
            v-for="row in opts.extraWallets"
            :key="row.walletId"
            class="flex items-start gap-2 cursor-pointer">
            <input
              :checked="localEnabledWallets.includes(row.walletId)"
              type="checkbox"
              :value="row.walletId"
              class="rounded mt-0.5"
              @change="toggleWallet(row.walletId)">
            <div class="flex flex-col">
              <span class="text-gray-900">{{walletLabel(row)}}</span>
              <span class="text-xs text-gray-600 mt-0.5">
                {{$t('appSettings_addsLabel', {
                  methods: methodSummary(row.supportedMethods)
                })}}
              </span>
            </div>
          </label>
        </div>
      </section>

      <!-- Advanced: Profiles section -->
      <section>
        <h4 class="text-sm font-medium mb-2 text-gray-700">
          {{$t('appSettings_advancedProfiles')}}
        </h4>
        <p class="text-xs text-gray-600 mb-2">
          {{$t('appSettings_profilesExplain')}}
        </p>

        <!-- Defaults (locked) -->
        <p
          v-if="opts.defaultProfiles.length > 0"
          class="text-xs text-gray-500 mt-2 mb-1">
          {{$t('appSettings_profilesDefaultsHeading')}}
        </p>
        <div class="flex flex-col gap-2">
          <label
            v-for="row in opts.defaultProfiles"
            :key="row.profile"
            class="flex items-start gap-2 opacity-90">
            <input
              type="checkbox"
              checked
              disabled
              class="rounded mt-0.5">
            <div class="flex flex-col">
              <span class="text-gray-900">
                {{profileLabel(row)}}
                <span class="text-xs text-gray-500">
                  {{$t('appSettings_lockedHint')}}
                </span>
              </span>
              <span class="text-xs text-gray-600 mt-0.5">
                {{$t('appSettings_addsLabel', {
                  methods: methodSummary(row.supportedMethods)
                })}}
              </span>
            </div>
          </label>
        </div>

        <!-- Extras (toggleable) -->
        <p class="text-xs text-gray-500 mt-3 mb-1">
          {{$t('appSettings_profilesExtrasHeading')}}
        </p>
        <p
          v-if="opts.extraProfiles.length === 0"
          class="text-xs text-gray-500">
          {{$t('appSettings_profilesExtrasEmpty')}}
        </p>
        <div
          v-else
          class="flex flex-col gap-2 max-h-48 overflow-y-auto">
          <label
            v-for="row in opts.extraProfiles"
            :key="row.profile"
            class="flex items-start gap-2 cursor-pointer">
            <input
              :checked="localEnabledProfiles.includes(row.profile)"
              type="checkbox"
              :value="row.profile"
              class="rounded mt-0.5"
              @change="toggleProfile(row.profile)">
            <div class="flex flex-col">
              <span class="text-gray-900">{{profileLabel(row)}}</span>
              <span class="text-xs text-gray-600 mt-0.5">
                {{$t('appSettings_addsLabel', {
                  methods: methodSummary(row.supportedMethods)
                })}}
              </span>
            </div>
          </label>
        </div>
      </section>

      <p class="text-xs text-gray-600 mt-4">
        {{$t('appSettings_refreshNote')}}
      </p>
    </q-card-section>
    <q-card-actions align="right">
      <q-btn
        flat
        :label="$t('appSettings_reset')"
        @click="handleReset" />
      <q-btn
        flat
        :label="$t('close')"
        @click="$emit('update:modelValue', false)" />
    </q-card-actions>
  </ModalDialog>
</template>

<script setup>
import {computed, ref, watch} from 'vue';
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  saveUserSettings
} from '../../common/wallets/canShowOption.js';
import ModalDialog from './ModalDialog.vue';
import {resolveProductName} from '../../common/wallets/index.js';
import {useExchangeOptions} from '../composables/useExchangeOptions.js';
import {useI18n} from 'vue-i18n';

const props = defineProps({
  modelValue: {type: Boolean, default: false}
});
const emit = defineEmits(['update:modelValue', 'update:userSettings']);

const {t} = useI18n({useScope: 'global'});

const {exchangeOptions} = useExchangeOptions();

const EMPTY_OPTIONS = {
  defaultWallets: [], extraWallets: [],
  defaultProfiles: [], extraProfiles: [],
  pickerEntries: []
};

const opts = computed(() => exchangeOptions.value || EMPTY_OPTIONS);

const localEnabledWallets = ref([]);
const localEnabledProfiles = ref([]);

const persist = () => {
  const settings = {
    enabledWallets: [...localEnabledWallets.value],
    enabledProfiles: [...localEnabledProfiles.value]
  };
  saveUserSettings(settings);
  emit('update:userSettings', settings);
};

const toggleWallet = id => {
  const idx = localEnabledWallets.value.indexOf(id);
  if(idx === -1) {
    localEnabledWallets.value.push(id);
  } else {
    localEnabledWallets.value.splice(idx, 1);
  }
};

const toggleProfile = id => {
  const idx = localEnabledProfiles.value.indexOf(id);
  if(idx === -1) {
    localEnabledProfiles.value.push(id);
  } else {
    localEnabledProfiles.value.splice(idx, 1);
  }
};

watch([localEnabledWallets, localEnabledProfiles], persist, {deep: true});

watch(() => props.modelValue, open => {
  if(!open) {
    return;
  }
  const loaded = loadUserSettings();
  localEnabledWallets.value = loaded.enabledWallets || [];
  localEnabledProfiles.value = loaded.enabledProfiles || [];
  emit('update:userSettings', loaded);
}, {immediate: true});

const handleReset = () => {
  localEnabledWallets.value = [...DEFAULT_USER_SETTINGS.enabledWallets];
  localEnabledProfiles.value = [...DEFAULT_USER_SETTINGS.enabledProfiles];
  persist();
  emit('update:modelValue', false);
};

const walletLabel = row =>
  resolveProductName({wallet: row, t, fallbackId: row.walletId});

const profileLabel = row => {
  if(row.nameKey && t(row.nameKey) !== row.nameKey) {
    return t(row.nameKey);
  }
  return row.profile;
};

const methodSummary = methods => {
  if(!Array.isArray(methods) || methods.length === 0) {
    return '';
  }
  return methods
    .map(m => {
      const key = `interactionMethodLabel_${m}`;
      const translated = t(key);
      return translated === key ? m : translated;
    })
    .join(', ');
};
</script>
