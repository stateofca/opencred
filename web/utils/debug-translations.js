/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a flat list of translation rows from original messages
 * and optional debug overrides.
 *
 * @param {object} options - Options hashmap.
 * @param {object} options.messages - Original i18n messages
 *   shaped `{[langCode]: Record<string, string>}`.
 * @param {object} [options.overrides] - Debug override values,
 *   same shape as messages.
 * @returns {Array<object>} Sorted translation rows.
 */
export function listTranslationRows({messages, overrides = {}} = {}) {
  const rows = [];
  const langs = _sortedUnion(
    Object.keys(messages ?? {}),
    Object.keys(overrides)
  );
  for(const lang of langs) {
    const origBucket = messages?.[lang] ?? {};
    const overBucket = overrides[lang] ?? {};
    const keys = _sortedUnion(
      Object.keys(origBucket),
      Object.keys(overBucket)
    );
    for(const key of keys) {
      const originalValue = origBucket[key] ?? '';
      const editedValue = overBucket[key];
      const currentValue = editedValue ?? originalValue;
      const changed = currentValue !== originalValue;
      rows.push({
        lang,
        key,
        originalValue,
        currentValue,
        editedValue,
        changed
      });
    }
  }
  return rows;
}

/**
 * Filter translation rows by a search string and/or
 * changed-only flag.
 *
 * @param {object} options - Options hashmap.
 * @param {Array<object>} options.rows - Rows from
 *   `listTranslationRows`.
 * @param {string} [options.filter] - Case-insensitive
 *   substring to match against lang, key, originalValue,
 *   currentValue, and editedValue.
 * @param {boolean} [options.changedOnly] - When true, return
 *   only rows where `changed` is true.
 * @returns {Array<object>} Filtered rows.
 */
export function filterTranslationRows({
  rows, filter = '', changedOnly = false
} = {}) {
  let result = rows ?? [];
  if(changedOnly) {
    result = result.filter(r => r.changed);
  }
  if(filter) {
    const lc = filter.toLowerCase();
    result = result.filter(r =>
      r.lang.toLowerCase().includes(lc) ||
      r.key.toLowerCase().includes(lc) ||
      r.originalValue.toLowerCase().includes(lc) ||
      r.currentValue.toLowerCase().includes(lc) ||
      (r.editedValue ?? '').toLowerCase().includes(lc));
  }
  return result;
}

/**
 * Return only changed translations grouped by language code.
 * Empty language groups are omitted.
 *
 * @param {object} options - Options hashmap.
 * @param {object} options.originalMessages - Original i18n
 *   messages shaped `{[langCode]: Record<string, string>}`.
 * @param {object} options.overrides - Debug override values,
 *   same shape as messages.
 * @returns {object} Changed translations shaped
 *   `{[langCode]: Record<string, string>}`.
 */
export function getChangedTranslations({
  originalMessages, overrides
} = {}) {
  const result = {};
  const rows = listTranslationRows({
    messages: originalMessages,
    overrides
  });
  for(const row of rows) {
    if(!row.changed) {
      continue;
    }
    if(!result[row.lang]) {
      result[row.lang] = {};
    }
    result[row.lang][row.key] = row.currentValue;
  }
  return result;
}

/**
 * Serialize a changed-translations object to a YAML string
 * suitable for pasting under `opencred.translations` or
 * workflow `translations`.
 *
 * @param {object} options - Options hashmap.
 * @param {object} options.translations - Changed translations
 *   shaped `{[langCode]: Record<string, string>}`.
 * @returns {string} YAML text, or empty string when there
 *   are no translations.
 */
export function serializeTranslationsYaml({translations} = {}) {
  const langs = Object.keys(translations ?? {}).sort();
  if(langs.length === 0) {
    return '';
  }
  const lines = [];
  for(const lang of langs) {
    lines.push(`${lang}:`);
    const keys = Object.keys(translations[lang]).sort();
    for(const key of keys) {
      const value = translations[lang][key];
      if(value.includes('\n')) {
        lines.push(`  ${key}: |`);
        const parts = value.split('\n');
        for(const part of parts) {
          lines.push(`    ${part}`);
        }
      } else if(_needsQuoting(value)) {
        lines.push(`  ${key}: "${_escapeYamlDouble(value)}"`);
      } else {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }
  return lines.join('\n') + '\n';
}

// -- private helpers -----------------------------------------------

/**
 * Return a sorted union of two string arrays.
 *
 * @param {string[]} a - First array.
 * @param {string[]} b - Second array.
 * @returns {string[]} Sorted unique values.
 */
function _sortedUnion(a, b) {
  return [...new Set([...a, ...b])].sort();
}

const _YAML_PLAIN_UNSAFE = /^[ \t]|[ \t]$|[:#{}[\],&*?|<>=!%@`"']|: | #/;
const _YAML_LOOKS_SPECIAL =
  /^(?:true|false|yes|no|on|off|null|~|\d[\d._]*)$/i;

/**
 * Determine whether a scalar value requires double-quoting
 * in YAML.
 *
 * @param {string} value - The string to check.
 * @returns {boolean} True if quoting is needed.
 */
function _needsQuoting(value) {
  if(value === '') {
    return true;
  }
  if(_YAML_PLAIN_UNSAFE.test(value)) {
    return true;
  }
  if(_YAML_LOOKS_SPECIAL.test(value)) {
    return true;
  }
  return false;
}

/**
 * Escape a string for use inside YAML double quotes.
 *
 * @param {string} value - The raw string.
 * @returns {string} Escaped string (without surrounding
 *   quotes).
 */
function _escapeYamlDouble(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
