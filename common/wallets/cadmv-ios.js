/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const cadmvIosWallet = {
  id: 'cadmv-ios',
  groupId: 'cadmv-wallet',
  name: 'CA DMV Wallet on iOS',
  productName: 'CA DMV Wallet',
  description: 'The CA DMV Wallet app is a free, secure, and convenient ' +
    'mobile application that allows California residents to store and ' +
    'present their mobile driver\'s license (mDL), identification card, ' +
    'or other DMV credentials on their smartphones.',
  icon: '/wallets/cadmv-wallet-icon.png',
  platform: ['ios'],
  supportedFormats: ['mso_mdoc', 'jwt_vc_json', 'ldp_vc'],
  supportedProfiles: {
    'cadmv-ios': {
      dcapi: {
        description: 'Click to request credentials from your CA DMV Wallet ' +
          '(iOS)',
        formats: ['mso_mdoc']
      }
    },
    'OID4VP-1.0': {
      qr: {
        description: 'Scan the QR code with your CA DMV Wallet (iOS)',
        formats: ['jwt_vc_json', 'ldp_vc']
      },
      link: {
        description: 'Click to open your CA DMV Wallet (iOS)',
        formats: ['jwt_vc_json', 'ldp_vc']
      }
    },
    'OID4VP-draft18': {
      qr: {
        description: 'Scan the QR code with your CA DMV Wallet (iOS)',
        formats: ['jwt_vc_json', 'ldp_vc']
      },
      link: {
        description: 'Click to open your CA DMV Wallet (iOS)',
        formats: ['jwt_vc_json', 'ldp_vc']
      }
    }
  },
  storefronts: [{
    type: 'apple',
    url: 'https://apps.apple.com/app/ca-dmv-wallet/id6449002508'
  }]
};
