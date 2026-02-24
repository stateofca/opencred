/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import nodeConfig from '@digitalbazaar/eslint-config/node-recommended';
import vue3Config from '@digitalbazaar/eslint-config/vue3-recommended';

export default [
  // quasar not yet supported
  // 'plugin:quasar/standard',
  ...nodeConfig,
  ...vue3Config,
  {
    rules: {
      'vue/no-v-html': 'off',
      'jsdoc/check-tag-names': ['error', {definedTags: ['openapi']}]
    }
  },
  // Disable jsdoc/require-description-complete-sentence for files with
  // decorative block comments that cause circular fixes with --fix
  {
    files: ['configs/config.js', 'lib/database.js'],
    rules: {
      'jsdoc/require-description-complete-sentence': 'off'
    }
  }
];
