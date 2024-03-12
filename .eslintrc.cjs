/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

module.exports = {
  root: true,
  env: {
    node: true
  },
  extends: [
    'plugin:quasar/standard',
    'digitalbazaar',
    'digitalbazaar/module',
    'digitalbazaar/vue3'
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/'
  ],
  rules: {
    'linebreak-style': [
      'error',
      (process.platform === 'win32' ? 'windows' : 'unix')
    ],
    'unicorn/prefer-node-protocol': 'error'
  }
};
