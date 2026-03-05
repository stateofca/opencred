/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {interactionWallet} from './interaction.js';
import {PROTOCOL_FORMAT_MAPPING} from '../index.js';

export {interactionWallet} from './interaction.js';

/**
 * Create a protocol-based wallet config for the given protocol ID.
 * Used for "advanced" protocol selection when no named wallet exists.
 *
 * @param {string} protocolId - Protocol ID (e.g. 'interact', 'OID4VP-draft18').
 * @returns {object|null} Wallet config or null if not supported.
 */
export function createProtocolWallet(protocolId) {
  if(!protocolId) {
    return null;
  }

  // Interaction protocol has a dedicated wallet
  if(protocolId === 'interact') {
    return interactionWallet;
  }

  const formats = PROTOCOL_FORMAT_MAPPING[protocolId];
  if(!formats || formats.length === 0) {
    return null;
  }

  // Protocols that support qr/link (OID4VP-style) or copy
  const qrLinkProtocols = [
    'OID4VP-draft18', 'OID4VP-1.0', 'OID4VP-combined',
    'OID4VP', 'OID4VP-haip-1.0', '18013-7-Annex-B'
  ];
  const copyOnlyProtocols = ['vcapi'];

  const supportedProtocols = {};

  if(qrLinkProtocols.includes(protocolId)) {
    supportedProtocols[protocolId] = {
      qr: {
        descriptionKey: 'protocolWallet_oid4vp_qr',
        formats
      },
      link: {
        descriptionKey: 'protocolWallet_oid4vp_link',
        formats
      }
    };
  } else if(copyOnlyProtocols.includes(protocolId)) {
    supportedProtocols[protocolId] = {
      copy: {
        descriptionKey: 'protocolWallet_vcapi_copy',
        formats
      }
    };
  } else if(protocolId === 'chapi') {
    supportedProtocols[protocolId] = {
      chapi: {
        descriptionKey: 'protocolWallet_chapi_chapi',
        formats
      }
    };
  } else {
    return null;
  }

  const descriptionKey = qrLinkProtocols.includes(protocolId) ?
    'protocolWallet_oid4vp_description' :
    copyOnlyProtocols.includes(protocolId) ?
      'protocolWallet_vcapi_description' :
      'protocolWallet_chapi_description';

  return {
    id: `protocol-${protocolId}`,
    name: protocolId,
    nameKey: `protocols_${protocolId}_name`,
    descriptionKey,
    supportedFormats: formats,
    supportedProtocols
  };
}
