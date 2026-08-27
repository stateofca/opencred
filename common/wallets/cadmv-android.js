/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const cadmvAndroidWallet = {
  id: 'cadmv-android',
  groupId: 'cadmv-wallet',
  name: 'CA DMV Wallet on Android',
  nameKey: 'wallet_cadmv-android_name',
  productName: 'CA DMV Wallet',
  description: 'The CA DMV Wallet app is a free, secure, and convenient ' +
    'mobile application that allows California residents to store and ' +
    'present their mobile driver\'s license (mDL), identification card, ' +
    'or other DMV credentials on their smartphones.',
  icon: '/wallets/cadmv-wallet-icon.png',
  platform: ['android'],
  supportedFormats: ['mso_mdoc', 'jwt_vc_json', 'ldp_vc'],
  supportedProfiles: {
    'cadmv-android': {
      dcapi: {
        description: 'Request credentials from your digital wallet on Android',
        formats: ['mso_mdoc']
      }
    },
    'OID4VP-1.0': {
      qr: {
        description: 'Scan the QR code with your digital wallet on Android',
        formats: ['jwt_vc_json', 'ldp_vc']
      },
      link: {
        description: 'Open your digital wallet on Android',
        formats: ['jwt_vc_json', 'ldp_vc']
      }
    },
    'OID4VP-draft18': {
      qr: {
        description: 'Scan the QR code with your digital wallet on Android',
        formats: ['jwt_vc_json', 'ldp_vc']
      },
      link: {
        description: 'Open your digital wallet on Android',
        formats: ['jwt_vc_json', 'ldp_vc']
      }
    }
  },
  storefronts: [{
    type: 'google',
    url: 'https://play.google.com/store/apps/details?id=gov.ca.dmv.wallet'
  }]
};
