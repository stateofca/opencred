/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const cadmvIosWallet = {
  id: 'cadmv-ios',
  name: 'CA DMV Wallet (iOS)',
  description: 'The CA DMV Wallet app is a free, secure, and convenient ' +
    'mobile application that allows California residents to store and ' +
    'present their mobile driver\'s license (mDL), identification card, ' +
    'or other DMV credentials on their smartphones.',
  icon: '/wallets/cadmv-wallet-icon.png',
  platform: ['ios'],
  supportedFormats: ['mso_mdoc'],
  supportedProtocols: {
    'cadmv-ios': {
      dcapi: {
        description: 'Click to request credentials from your CA DMV Wallet ' +
          '(iOS)',
        formats: ['mso_mdoc']
      }
    }
  }
};
