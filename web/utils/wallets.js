/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {domainToDidWeb} from '../../common/didWeb.js';

export const vcapiDeepLink = ({exchange, origin}) => {
  const vcapiUrl = exchange.protocols?.vcapi;
  if(!vcapiUrl) {
    return null;
  }

  // Extract issuer from exchange or use default
  const issuer = domainToDidWeb(new URL(vcapiUrl).origin);
  const challenge = exchange.challenge || '';

  // Construct LCW deep link
  return `${origin}/?request=${encodeURIComponent(vcapiUrl)}` +
    `&issuer=${encodeURIComponent(issuer)}` +
    `&auth_type=bearer` +
    `&challenge=${encodeURIComponent(challenge)}`;
};
const lcwDeepLink = ({exchange}) => vcapiDeepLink({exchange, origin: 'https://lcw.app'});

export const WALLETS_REGISTRY = {
  'cadmv-wallet': {
    id: 'cadmv-wallet',
    name: 'CA DMV Wallet',
    description: 'The CA DMV Wallet app is a free, secure, and convenient ' +
      'mobile application that allows California residents to store and' +
      'present their mobile driver\'s license (mDL), identification card, ' +
      'or other DMV credentials on their smartphones.',
    icon: '/wallets/cadmv-wallet-icon.png',
    /**
     * Get the default protocol for this wallet based on workflow
     * @param {Object} options - Options object
     * @param {Object} options.workflow - The workflow object (optional)
     * @param {Array<string>} options.availableProtocols - Available protocols
     * @returns {string|null} The default protocol ID or null
     */
    getDefaultProtocol({workflow, availableProtocols}) {
      // OID4VP-1.0 if mdoc format query, otherwise OID4VP-draft18
      const hasMdoc = hasMdocFormat(workflow);
      if(hasMdoc && availableProtocols?.includes('OID4VP-1.0')) {
        return 'OID4VP-1.0';
      }
      if(availableProtocols?.includes('OID4VP-draft18')) {
        return 'OID4VP-draft18';
      }
      return availableProtocols?.[0] || null;
    },
    appStoreLinks: {
      googlePlay: 'https://play.google.com/store/apps/details?id=gov.ca.dmv.wallet',
      ios: 'https://apps.apple.com/app/ca-dmv-wallet/id6449002508'
    },
    homepage: 'https://www.dmv.ca.gov/portal/ca-dmv-wallet/',
    supportedProtocols: {
      'OID4VP-draft18': {
        qr: 'Select Scan website QR code from within the app',
        link: 'Click the button to launch your CA DMV wallet on this device',
        dcapi: 'Click the button to request credentials from your wallet'
      },
      'OID4VP-1.0': {
        qr: 'Select Scan website QR code from within the app',
        link: 'Click the button to launch your CA DMV wallet on this device',
        dcapi: 'Click the button to request credentials from your wallet'
      },
      'OID4VP-combined': {
        qr: 'Select Scan website QR code from within the app',
        link: 'Click the button to launch your CA DMV wallet on this device'
      },
      '18013-7-Annex-D': {
        dcapi: 'Click the button to request credentials from your wallet'
      },
      'OID4VP-HAIP-1.0': {
        dcapi: 'Click the button to request credentials from your wallet'
      }
    }
  },
  lcw: {
    id: 'lcw',
    name: 'Learner Credential Wallet',
    description: 'An open source mobile wallet developed by the Digital ' +
      'Credentials Consortium, a network of leading international ' +
      'universities designing an open infrastructure for academic credentials.',
    appStoreLinks: {
      googlePlay: 'https://play.google.com/store/apps/details?id=app.lcw',
      ios: 'https://apps.apple.com/app/learner-credential-wallet/id1590615710'
    },
    homepage: 'https://lcw.app/',
    /**
     * Get the default protocol for this wallet based on workflow
     * @param {Object} options - Options object
     * @param {Object} options.workflow - The workflow object (optional)
     * @param {Array<string>} options.availableProtocols - Available protocols
     * @returns {string|null} The default protocol ID or null
     */
    getDefaultProtocol({availableProtocols}) {
      // LCW wallet defaults to vcapi
      if(availableProtocols?.includes('vcapi')) {
        return 'vcapi';
      }
      return availableProtocols?.[0] || null;
    },
    supportedProtocols: {
      vcapi: {
        qr: {
          description: 'Select the plus button in the main menu and then' +
            'select scan QR code.',
          getUrl: lcwDeepLink
        },
        link: {
          description: 'Click the button to open your wallet app',
          getUrl: lcwDeepLink
        }
      }
    }
  }
};

/**
 * Check if a wallet supports a protocol with a specific interaction type
 * @param {string} walletId - The wallet ID
 * @param {string} protocolId - The protocol ID
 * @param {string} interactionType - The interaction type
 *   ('qr', 'link', 'dcapi', 'chapi')
 * @returns {boolean} True if the wallet supports the protocol with
 *   the interaction type
 */
export function walletSupportsProtocol(walletId, protocolId, interactionType) {
  if(!walletId || !protocolId || !interactionType) {
    return false;
  }
  const wallet = WALLETS_REGISTRY[walletId];
  if(!wallet || !wallet.supportedProtocols) {
    return false;
  }
  const protocolSupport = wallet.supportedProtocols[protocolId];
  if(!protocolSupport) {
    return false;
  }
  // Check if the interaction type is supported
  return protocolSupport.hasOwnProperty(interactionType);
}

/**
 * Check if a protocol supports a specific interaction type
 * @param {string} protocolId - The protocol ID
 * @param {string} interactionType - The interaction type
 *   ('qr', 'link', 'dcapi', 'chapi')
 * @returns {boolean} True if the protocol supports the interaction type
 */
export function protocolSupportsInteraction(protocolId, interactionType) {
  if(!protocolId || !interactionType) {
    return false;
  }

  // OID4VP protocols support QR and link interactions
  if(protocolId === 'OID4VP' || protocolId === 'OID4VP-draft18' ||
    protocolId === 'OID4VP-1.0' || protocolId === 'OID4VP-combined') {
    return interactionType === 'qr' || interactionType === 'link';
  }

  // DC API protocol supports dcapi interaction
  if(protocolId === '18013-7-Annex-D' || protocolId === 'OID4VP-HAIP-1.0') {
    return interactionType === 'dcapi';
  }

  // CHAPI protocol supports chapi interaction
  if(protocolId === 'chapi') {
    return interactionType === 'chapi';
  }

  // VC-API and interact protocols support QR and copy URL
  if(protocolId === 'vcapi' || protocolId === 'interact') {
    return interactionType === 'qr' || interactionType === 'link';
  }

  return false;
}

/**
 * Check if a workflow has mdoc format credentials
 * @param {Object} workflow - Workflow configuration
 * @returns {boolean} True if any query item has mso_mdoc format
 */
export function hasMdocFormat(workflow) {
  return workflow?.query?.some(item => {
    const formats = item.format || [];
    return Array.isArray(formats) && formats.includes('mso_mdoc');
  });
}

/**
 * Check if a wallet supports DC API for a specific protocol
 * @param {Object} walletsRegistry - The wallets registry
 * @param {string} walletId - The wallet ID
 * @param {string} protocolId - The protocol ID
 * @returns {boolean} True if the wallet supports DC API for the protocol
 */
export function walletSupportsDcApiForProtocol(walletsRegistry, walletId,
  protocolId) {
  if(!walletId) {
    return true; // No wallet = can try DC API
  }
  return walletSupportsProtocol(walletId, protocolId, 'dcapi');
}

/**
 * Check if a wallet or protocol supports a specific interaction type
 * @param {Object} walletsRegistry - The wallets registry
 * @param {Object} protocolsRegistry - The protocols registry
 * @param {string} walletId - The wallet ID (or null)
 * @param {string} protocolId - The protocol ID
 * @param {string} interactionType - The interaction type
 * @returns {boolean} True if supported
 */
export function supportsInteraction({walletId, protocolId, interactionType}) {
  if(walletId) {
    return walletSupportsProtocol(walletId, protocolId, interactionType);
  }
  return protocolSupportsInteraction(protocolId, interactionType);
}

/**
 * Get available interaction methods in priority order
 * @param {Object} options - Options object
 * @param {Object} options.walletsRegistry - The wallets registry
 * @param {Object} options.protocolsRegistry - The protocols registry
 * @param {string} options.walletId - The wallet ID (or null)
 * @param {string} options.protocolId - The protocol ID
 * @param {boolean} options.prefersSameDevice - Whether user prefers same device
 * @param {boolean} options.isMobile - Whether on mobile device
 * @param {boolean} options.dcApiSystemAvailable - Whether DC API is available
 * @param {Object} options.workflow - Workflow configuration
 * @param {Object} options.interactionState - Interaction state object
 * @param {Array<string>} [options.availableProtocols] - Available protocols
 *   for fallback
 * @returns {Array<string>} Array of available interaction methods in
 *   priority order
 */
export function getAvailableInteractionMethods({
  walletsRegistry,
  walletId,
  protocolId,
  prefersSameDevice,
  dcApiSystemAvailable,
  workflow,
  interactionState,
  availableProtocols = []
}) {
  const methods = [];

  // 1. DC API (highest priority) Only available if: system supports it, enabled
  //    in workflow, wallet supports it, protocol is not excluded, has mdoc
  //    format query (or is 18013-7-Annex-D), and not overridden
  if(dcApiSystemAvailable &&
    workflow?.dcApiEnabled !== false &&
    walletSupportsDcApiForProtocol(walletsRegistry, walletId, protocolId) &&
    !['chapi', 'vcapi', 'interact'].includes(protocolId) &&
    (hasMdocFormat(workflow) || protocolId === '18013-7-Annex-D' ||
      protocolId === 'OID4VP-HAIP-1.0') &&
    !interactionState.dcApiErrorOverride) {
    methods.push('dcapi');
  }

  // 2. QR (if not mobile and not prefersSameDevice)
  if(supportsInteraction({walletId, protocolId, interactionType: 'qr'}) &&
   !prefersSameDevice) {
    methods.push('qr');
  }

  // 3. Same Device Link (if mobile or prefersSameDevice)
  if(supportsInteraction({walletId, protocolId, interactionType: 'link'}) &&
    prefersSameDevice) {
    methods.push('samedevice');
  }

  // 4. CHAPI
  if(supportsInteraction({walletId, protocolId, interactionType: 'chapi'}) ||
    protocolId === 'chapi') {
    methods.push('chapi');
  }

  // 5. If no methods found and DC API was overridden, check alternative
  // protocols for fallback interaction methods
  if(methods.length === 0 && interactionState.dcApiErrorOverride &&
    availableProtocols.length > 0) {
    // Try to find alternative protocols that support other interaction methods
    for(const altProtocolId of availableProtocols) {
      if(altProtocolId === protocolId) {
        continue; // Skip current protocol
      }

      // Check QR for alternative protocol
      if(!prefersSameDevice &&
        supportsInteraction({walletId, protocolId: altProtocolId,
          interactionType: 'qr'})) {
        methods.push('qr');
        break; // Found a method, stop searching
      }

      // Check Same Device Link for alternative protocol
      if(prefersSameDevice &&
        supportsInteraction({walletId, protocolId: altProtocolId,
          interactionType: 'link'})) {
        methods.push('samedevice');
        break; // Found a method, stop searching
      }

      // Check CHAPI for alternative protocol
      if(supportsInteraction({walletId, protocolId: altProtocolId,
        interactionType: 'chapi'}) ||
        altProtocolId === 'chapi') {
        methods.push('chapi');
        break; // Found a method, stop searching
      }
    }
  }

  return methods;
}

/**
 * Default link generation handler for a protocol supported by a wallet.
 * @param {Object} options - Options object
 * @param {Object} options.exchange - The exchagne object with protocols
 *   and challenge
 * @param {string} options.protocol - The protocol ID
 * @returns {string|null} - The generated link URL, or null if not supported
 */
export const getUrlDefault = ({exchange, protocol}) =>
  exchange.protocols?.[protocol] || null;

/**
 * Generate a wallet-specific link for QR codes or same-device links
 * @param {Object} options - Options object
 * @param {Object} options.exchange - The exchange object with protocols
 *   and challenge
 * @param {string} options.walletId - The wallet ID
 * @param {string} options.protocol - The protocol ID
 * @param {string} options.interactionMethod - The interaction method
 *   ('qr' or 'link')
 * @param {Object} [options.workflow] - The workflow object (optional)
 * @returns {string|null} The generated link URL, or null if not supported
 */
export function generateWalletLink({
  exchange, walletId, protocol, interactionMethod, workflow
}) {
  if(!exchange || !walletSupportsProtocol(
    walletId, protocol, interactionMethod)) {
    return null;
  }

  // Only generate links for qr and link interaction methods
  if(!['qr', 'link'].includes(interactionMethod)) {
    return null;
  }

  const linkMetadata = WALLETS_REGISTRY[walletId].supportedProtocols[
    protocol][interactionMethod];
  if(!linkMetadata) {
    return null;
  }

  // If linkMetadata is a string, it's just a description (no URL generation)
  if(typeof linkMetadata === 'string' || !linkMetadata?.getUrl) {
    return getUrlDefault({exchange, protocol});
  }

  // If linkMetadata is an object with getUrl function, call it
  if(typeof linkMetadata === 'object' &&
    typeof linkMetadata.getUrl === 'function') {
    return linkMetadata.getUrl({exchange, protocol, workflow});
  }

  // Default: return null for unsupported combinations
  return null;
}

