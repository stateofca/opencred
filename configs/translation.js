/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const i18nDir = path.join(__dirname, '..', 'common', 'i18n');

/**
 * Loads default translations from JSON files in common/i18n/
 * @returns {Object} Object with locale keys mapping to translation objects
 */
const loadDefaultTranslations = () => {
  const translations = {};

  try {
    // Read all JSON files in the i18n directory
    const files = readdirSync(i18nDir).filter(file =>
      file.endsWith('.json')
    );

    for(const file of files) {
      const locale = path.basename(file, '.json');
      const filePath = path.join(i18nDir, file);
      try {
        const content = readFileSync(filePath, 'utf8');
        translations[locale] = JSON.parse(content);
      } catch(error) {
        // Log error but continue loading other locales
        console.warn(`Failed to load locale file ${file}:`, error.message);
      }
    }
  } catch(error) {
    // If directory doesn't exist or can't be read, return empty object
    // This allows the system to work even if i18n files are missing
    console.warn(`Failed to load i18n directory ${i18nDir}:`, error.message);
  }

  // Ensure at least 'en' exists (fallback to empty object if loading failed)
  if(!translations.en) {
    translations.en = {};
  }

  return translations;
};

export const defaultTranslations = loadDefaultTranslations();

export const combineTranslations = (customTranslations, defaults) => {
  const dt = defaults || defaultTranslations;
  const combined = {};
  Object.keys(dt).forEach(lang => {
    combined[lang] = Object.assign(
      {},
      dt[lang],
      customTranslations[lang] || {}
    );
  });

  Object.keys(customTranslations).forEach(lang => {
    if(!dt[lang]) {
      // Ensure there are no empty strings in any translation, even if
      // it means a partially translated interface
      combined[lang] = Object.assign({}, dt.en, customTranslations[lang]);
    }
  });
  return combined;
};
