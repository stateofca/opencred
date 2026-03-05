/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const interactionWallet = {
  id: 'interaction',
  name: 'Interaction',
  nameKey: 'protocols_interact_name',
  descriptionKey: 'protocolWallet_interact_description',
  supportedFormats: ['ldp_vc'],
  supportedProtocols: {
    interact: {
      copy: {
        descriptionKey: 'protocolWallet_interact_copy',
        formats: ['ldp_vc']
        // getUrl defaults to getUrlDefault in helper function
      },
      qr: {
        descriptionKey: 'protocolWallet_interact_qr',
        formats: ['ldp_vc']
        // getUrl defaults to getUrlDefault in helper function
      }
    }
  }
};
