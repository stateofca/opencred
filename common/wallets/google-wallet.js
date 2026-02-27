/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const googleWallet = {
  id: 'google-wallet',
  name: 'Google Wallet',
  description: 'Google Wallet for storing and presenting digital ' +
    'credentials on Android devices.',
  icon: '/wallets/google-wallet-icon.png',
  supportedFormats: ['mso_mdoc'],
  supportedProtocols: {
    '18013-7-Annex-D': {
      dcapi: {
        description: 'Click the button to request credentials from your' +
          'wallet (Android devices)',
        formats: ['mso_mdoc']
      }
    }
  }
};
