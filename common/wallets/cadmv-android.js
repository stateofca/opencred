/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const cadmvAndroidWallet = {
  id: 'cadmv-android',
  name: 'CA DMV Wallet (Android)',
  description: 'The CA DMV Wallet app is a free, secure, and convenient ' +
    'mobile application that allows California residents to store and ' +
    'present their mobile driver\'s license (mDL), identification card, ' +
    'or other DMV credentials on their smartphones.',
  icon: '/wallets/cadmv-wallet-icon.png',
  platform: ['android'],
  supportedFormats: ['mso_mdoc'],
  supportedProtocols: {
    'cadmv-android': {
      dcapi: {
        description: 'Click to request credentials from your CA DMV Wallet ' +
          '(Android)',
        formats: ['mso_mdoc']
      }
    }
  }
};
