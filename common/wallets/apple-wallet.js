/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const appleWallet = {
  id: 'apple-wallet',
  name: 'Apple Wallet',
  description: 'Apple Wallet for storing and presenting digital ' +
    'credentials on iOS devices.',
  icon: '/wallets/apple-wallet-icon.png',
  platform: ['ios'],
  supportedFormats: ['mso_mdoc'],
  supportedProfiles: {
    '18013-7-Annex-C': {
      dcapi: {
        description: 'Click the button to request credentials from your ' +
          'wallet (iOS devices)',
        formats: ['mso_mdoc']
      }
    },
    'apple-wallet': {
      dcapi: {
        description: 'Open with Apple Wallet — signed Annex C ' +
          'request with ReaderAuth.',
        formats: ['mso_mdoc']
      }
    }
  }
};
