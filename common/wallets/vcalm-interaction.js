/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const vcalmInteractionWallet = {
  id: 'vcalm-interaction',
  name: 'VCALM Interaction',
  description: 'Copy the interaction URL to use with VCALM-compatible wallets.',
  supportedFormats: ['ldp_vc'],
  supportedProtocols: {
    interact: {
      copy: {
        description: 'Copy the link to open in your VCALM-compatible wallet',
        formats: ['ldp_vc']
        // getUrl defaults to getUrlDefault in helper function
      },
      qr: {
        description: 'Scan the QR code with your VCALM-compatible wallet',
        formats: ['ldp_vc']
        // getUrl defaults to getUrlDefault in helper function
      }
    }
  }
};
