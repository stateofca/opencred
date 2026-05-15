/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {computed, onUnmounted, reactive, watch} from 'vue';
import {
  getChangedTranslations,
  listTranslationRows,
  serializeTranslationsYaml
} from '../utils/debug-translations.js';
import {useDebug} from './useDebug.js';
import {useI18n} from 'vue-i18n';

// Module-level singleton state persists across component
// mounts; cleared on page refresh.
const _overrides = reactive({});
let _originalMessages = null;

/**
 * Reactive debug overrides for consumption by
 * useReactiveI18n. Shaped
 * `{[langCode]: Record<string, string>}`.
 */
export const debugOverrides = _overrides;

/**
 * Composable for memory-only debug translation overrides.
 * Captures original global i18n messages, tracks edits,
 * exposes dirty state, and registers a beforeunload
 * listener when debug mode is active and edits exist.
 *
 * @returns {object} Translation debug state and actions.
 */
export function useDebugTranslations() {
  const i18n = useI18n({useScope: 'global'});
  const {debugEnabled} = useDebug();

  // Capture original messages once from the global i18n
  // instance; the app config endpoint provides effective
  // translations including workflow overrides.
  if(!_originalMessages) {
    _originalMessages = JSON.parse(
      JSON.stringify(i18n.messages.value)
    );
  }

  const originalMessages = computed(
    () => _originalMessages
  );

  const rows = computed(() => listTranslationRows({
    messages: _originalMessages,
    overrides: _overrides
  }));

  const changedTranslations = computed(() =>
    getChangedTranslations({
      originalMessages: _originalMessages,
      overrides: _overrides
    }));

  const yamlText = computed(() =>
    serializeTranslationsYaml({
      translations: changedTranslations.value
    }));

  const dirty = computed(() =>
    Object.keys(changedTranslations.value).length > 0);

  /**
   * Set a debug translation override and apply it to
   * the global i18n instance.
   *
   * @param {object} options - Options hashmap.
   * @param {string} options.lang - Language code.
   * @param {string} options.key - Translation key.
   * @param {string} options.value - New value.
   */
  function setTranslation({lang, key, value}) {
    if(!_overrides[lang]) {
      _overrides[lang] = {};
    }
    _overrides[lang][key] = value;
    i18n.mergeLocaleMessage(lang, {[key]: value});
  }

  /**
   * Reset a single debug translation override to the
   * original value.
   *
   * @param {object} options - Options hashmap.
   * @param {string} options.lang - Language code.
   * @param {string} options.key - Translation key.
   */
  function resetTranslation({lang, key}) {
    if(_overrides[lang]) {
      delete _overrides[lang][key];
      if(Object.keys(_overrides[lang]).length === 0) {
        delete _overrides[lang];
      }
    }
    const original =
      _originalMessages?.[lang]?.[key] ?? '';
    i18n.mergeLocaleMessage(lang, {[key]: original});
  }

  /**
   * Reset all debug translation overrides and restore
   * original global i18n messages.
   */
  function resetAllTranslations() {
    for(const lang of Object.keys(_overrides)) {
      delete _overrides[lang];
    }
    for(const [locale, msgs] of Object.entries(
      _originalMessages ?? {}
    )) {
      i18n.setLocaleMessage(locale, {...msgs});
    }
  }

  // --- beforeunload management ---

  function _onBeforeUnload(event) {
    event.preventDefault();
    event.returnValue = '';
  }

  let _listenerActive = false;

  watch(
    () => [debugEnabled.value, dirty.value],
    ([dbg, drt]) => {
      const shouldListen = dbg && drt;
      if(shouldListen && !_listenerActive) {
        window.addEventListener(
          'beforeunload', _onBeforeUnload
        );
        _listenerActive = true;
      } else if(!shouldListen && _listenerActive) {
        window.removeEventListener(
          'beforeunload', _onBeforeUnload
        );
        _listenerActive = false;
      }
    },
    {immediate: true}
  );

  onUnmounted(() => {
    if(_listenerActive) {
      window.removeEventListener(
        'beforeunload', _onBeforeUnload
      );
      _listenerActive = false;
    }
  });

  return {
    originalMessages,
    rows,
    changedTranslations,
    yamlText,
    dirty,
    setTranslation,
    resetTranslation,
    resetAllTranslations
  };
}
