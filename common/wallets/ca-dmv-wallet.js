/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const caDmvWallet = {
  id: 'cadmv-wallet',
  name: 'CA DMV Wallet',
  description: 'The CA DMV Wallet app is a free, secure, and convenient ' +
    'mobile application that allows California residents to store and ' +
    'present their mobile driver\'s license (mDL), identification card, ' +
    'or other DMV credentials on their smartphones.',
  icon: '/wallets/cadmv-wallet-icon.png',
  supportedFormats: ['mso_mdoc', 'ldp_vc', 'jwt_vc_json'],
  supportedProtocols: {
    'OID4VP-draft18': {
      qr: {
        description: 'Select Scan website QR code from within the app',
        formats: ['ldp_vc', 'jwt_vc_json']
        // getUrl defaults to getUrlDefault in helper function
      },
      link: {
        description: 'Click to launch your CA DMV wallet on this device',
        formats: ['ldp_vc', 'jwt_vc_json']
        // getUrl defaults to getUrlDefault in helper function
      }
    },
    '18013-7-Annex-D': {
      dcapi: {
        description: 'Click to request credentials from your wallet ' +
          '(Android devices)',
        formats: ['mso_mdoc']
      }
    }
  }
};
