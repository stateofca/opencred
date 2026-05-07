/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {useExchangeContext} from './useExchangeContext.js';
import {useI18n} from 'vue-i18n';
import {watch} from 'vue';

/**
 * Composable for reactive i18n with workflow translations.
 * Automatically pulls translations from the exchange context
 * and merges them into a local i18n scope.
 *
 * @param {object} [options] - Options.
 * @param {import('vue').ComputedRef<object>} [options.messages]
 *   Override translations source. Defaults to workflow translations
 *   from useExchangeContext().
 * @returns {object} I18n instance with added `te` helper.
 */
export function useReactiveI18n({messages} = {}) {
  const {translations} = useExchangeContext();
  const source = messages || translations;

  const i18n = useI18n({useScope: 'local'});

  watch(source, msgs => {
    for(const [locale, msg] of Object.entries(msgs || {})) {
      i18n.mergeLocaleMessage(locale, msg);
    }
  }, {immediate: true, deep: true});

  /**
   * Check if a translation key exists and has a non-empty value.
   *
   * @param {string} key - Translation key.
   * @returns {boolean} True if key exists with non-empty value.
   */
  function te(key) {
    const translated = i18n.t(key);
    if(!translated || translated === '') {
      return false;
    }
    return translated !== key;
  }

  return {...i18n, te};
}
