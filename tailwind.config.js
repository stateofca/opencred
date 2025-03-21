/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/* eslint-disable unicorn/prefer-module */

import tailwindClipPath from 'tailwind-clip-path';
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/**/*.{html,js,vue}'],
  theme: {
    extend: {},
    clipPath: {
      bg: 'polygon(0 0,100% 0,100% 75%,0 100%)',
    },
  },
  plugins: [tailwindClipPath],
};
