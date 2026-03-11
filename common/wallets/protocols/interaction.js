/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ALL_CREDENTIAL_FORMATS} from '../protocol-format-mapping.js';

export const interactionWallet = {
  id: 'interaction',
  name: 'Interaction',
  nameKey: 'protocols_interact_name',
  descriptionKey: 'protocolWallet_interact_description',
  supportedFormats: ALL_CREDENTIAL_FORMATS,
  supportedProtocols: {
    interact: {
      copy: {
        descriptionKey: 'protocolWallet_interact_copy',
        formats: ALL_CREDENTIAL_FORMATS
        // getUrl defaults to getUrlDefault in helper function
      },
      qr: {
        descriptionKey: 'protocolWallet_interact_qr',
        formats: ALL_CREDENTIAL_FORMATS
        // getUrl defaults to getUrlDefault in helper function
      }
    }
  }
};
