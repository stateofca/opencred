/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const appleWallet = {
  id: 'apple-wallet',
  name: 'Digital Wallet on Apple Device',
  description: 'Apple Wallet for storing and presenting digital ' +
    'credentials on iOS devices.',
  icon: '/wallets/apple-wallet-icon.png',
  platform: ['ios'],
  supportedFormats: ['mso_mdoc'],
  supportedProfiles: {
    'apple-wallet': {
      dcapi: {
        description: 'Open with Apple Wallet — signed Annex C ' +
          'request with ReaderAuth.',
        formats: ['mso_mdoc']
      }
    },
    '18013-7-Annex-C': {
      dcapi: {
        description: 'Click the button to request credentials from your ' +
          'wallet (iOS devices)',
        formats: ['mso_mdoc']
      }
    }
  },
  storefronts: [{
    type: 'apple',
    url: 'https://apps.apple.com/us/app/apple-wallet/id1160481993'
  }]
};
