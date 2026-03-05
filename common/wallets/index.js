/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createProtocolWallet} from './protocols/index.js';
import {PROTOCOL_FORMAT_MAPPING} from './protocol-format-mapping.js';
import {WALLETS_REGISTRY} from './wallets-registry.js';

export {PROTOCOL_FORMAT_MAPPING};
export {
  canShowOption,
  DEFAULT_USER_SETTINGS,
  getAvailableProtocolIds,
  getAvailableWalletIds,
  loadUserSettings,
  saveUserSettings
} from './canShowOption.js';
export {WALLETS_REGISTRY};

/**
 * Global priority order for interaction methods.
 * Higher priority methods appear first in ordered lists.
 */
export const INTERACTION_METHOD_PRIORITY = [
  'dcapi', 'qr-and-link', 'qr-and-copy', 'link', 'copy', 'qr', 'chapi'
];

/**
 * Global priority order for protocols.
 * Higher priority protocols appear first in ordered lists.
 */
export const PROTOCOL_PRIORITY = [
  'OID4VP-draft18',
  'OID4VP-1.0',
  'OID4VP-combined',
  '18013-7-Annex-D',
  '18013-7-Annex-C',
  'vcapi',
  'interact',
  'chapi'
];

/**
 * Default getUrl function for qr/link interaction methods.
 * Returns the protocol URL from the exchange object.
 *
 * @param {object} options - Options object.
 * @param {object} options.exchange - Exchange object with protocols property.
 * @param {string} options.protocol - Protocol ID.
 * @returns {string|null} Protocol URL or null if not available.
 */
export function getUrlDefault({exchange, protocol}) {
  return exchange?.protocols?.[protocol] || null;
}

/**
 * Get wallet IDs that support a given credential format.
 *
 * @param {object} options - Options object.
 * @param {Array<string>} options.walletIds - Array of wallet IDs to check.
 * @param {string} options.format - Credential format ('ldp_vc',
 *   'jwt_vc_json', or 'mso_mdoc').
 * @param {object} [options.registry=WALLETS_REGISTRY] - Wallet registry to use.
 * @returns {Array<string>} Array of wallet IDs that support the format.
 */
export function getWalletsSupportingFormat({
  walletIds, format, registry = WALLETS_REGISTRY
}) {
  if(!Array.isArray(walletIds) || !format) {
    return [];
  }

  return walletIds.filter(walletId => {
    const wallet = registry[walletId];
    if(!wallet || !wallet.supportedFormats) {
      return false;
    }
    return Array.isArray(wallet.supportedFormats) &&
      wallet.supportedFormats.includes(format);
  });
}

/**
 * Get ordered list of protocol/interaction method combinations for a wallet
 * and format.
 *
 * @param {object} options - Options object.
 * @param {string} options.walletId - Wallet ID.
 * @param {string} options.format - Credential format ('ldp_vc', 'jwt_vc_json',
 *   or 'mso_mdoc').
 * @param {object} options.exchange - Exchange object with protocols property.
 * @param {object} [options.registry=WALLETS_REGISTRY] - Wallet registry to use.
 * @returns {Array<{protocolId: string, request: string|object,
 *   interactionMethod: string}>}
 *   Ordered array of protocol/interaction method combinations.
 */
export function getProtocolInteractionMethods({
  walletId, format, exchange, registry = WALLETS_REGISTRY
}) {
  if(!walletId || !format) {
    return [];
  }

  const wallet = registry[walletId];
  if(!wallet || !wallet.supportedProtocols) {
    return [];
  }

  // Collect all protocol/interaction method pairs that support the format
  const candidates = [];

  for(const [protocolId, protocolConfig] of Object.entries(
    wallet.supportedProtocols)) {
    if(!protocolConfig || typeof protocolConfig !== 'object') {
      continue;
    }

    for(const [interactionMethod, methodConfig] of Object.entries(
      protocolConfig)) {
      if(!methodConfig || typeof methodConfig !== 'object') {
        continue;
      }

      // Check if this interaction method supports the requested format
      const formats = methodConfig.formats;
      if(!Array.isArray(formats) || !formats.includes(format)) {
        continue;
      }

      // Generate request/URL
      let request = null;

      if(interactionMethod === 'qr' || interactionMethod === 'link' ||
        interactionMethod === 'copy') {
        // For qr, link, and copy, use getUrl if available,
        // otherwise use default
        if(typeof methodConfig.getUrl === 'function') {
          request = methodConfig.getUrl({exchange, protocol: protocolId});
        } else {
          request = getUrlDefault({exchange, protocol: protocolId});
        }
      } else if(['dcapi', 'chapi'].includes(interactionMethod)) {
        // For dcapi and chapi, use getRequest if available, otherwise
        // use protocol URL
        if(typeof methodConfig.getRequest === 'function') {
          request = methodConfig.getRequest({exchange, protocol: protocolId});
        } else if(exchange?.protocols?.[protocolId]) {
          // Return protocol URL as placeholder - actual request construction
          // may require async operations
          request = exchange.protocols[protocolId];
        }
      }

      // Only add if we have a valid request
      if(request !== null && request !== undefined) {
        candidates.push({
          protocolId,
          interactionMethod,
          request,
          // Store priority indices for sorting
          _interactionPriority: INTERACTION_METHOD_PRIORITY.indexOf(
            interactionMethod),
          _protocolPriority: PROTOCOL_PRIORITY.indexOf(protocolId)
        });
      }
    }
  }

  // Sort by interaction method priority first, then protocol priority
  candidates.sort((a, b) => {
    // Handle missing priorities (shouldn't happen, but be safe)
    const aInteractionPriority = a._interactionPriority === -1 ?
      Infinity : a._interactionPriority;
    const bInteractionPriority = b._interactionPriority === -1 ?
      Infinity : b._interactionPriority;

    if(aInteractionPriority !== bInteractionPriority) {
      return aInteractionPriority - bInteractionPriority;
    }

    const aProtocolPriority = a._protocolPriority === -1 ?
      Infinity : a._protocolPriority;
    const bProtocolPriority = b._protocolPriority === -1 ?
      Infinity : b._protocolPriority;

    return aProtocolPriority - bProtocolPriority;
  });

  // Remove temporary priority fields
  return candidates.map(({
    // eslint-disable-next-line no-unused-vars
    _interactionPriority, _protocolPriority, ...rest
  }) =>
    rest);
}

/**
 * Extract credential formats from workflow query.
 * Handles both simplified query format (query[].format) and DCQL format.
 *
 * @param {object} workflow - Workflow object with query property.
 * @returns {Array<string>} Array of unique credential format strings
 *   (e.g., ['mso_mdoc', 'ldp_vc', 'jwt_vc_json']).
 */
export function extractCredentialFormats(workflow) {
  if(!workflow) {
    return [];
  }

  const formats = new Set();

  // Check for simplified query format
  if(workflow.query && Array.isArray(workflow.query)) {
    for(const q of workflow.query) {
      if(q.format) {
        if(Array.isArray(q.format)) {
          q.format.forEach(f => formats.add(f));
        } else if(typeof q.format === 'string') {
          formats.add(q.format);
        }
      }
    }
  } else if(workflow.dcql_query?.credentials &&
    Array.isArray(workflow.dcql_query.credentials)) {
    for(const cred of workflow.dcql_query.credentials) {
      // DCQL format might have formats in different places
      if(cred.format) {
        if(Array.isArray(cred.format)) {
          cred.format.forEach(f => formats.add(f));
        } else if(typeof cred.format === 'string') {
          formats.add(cred.format);
        }
      }
      // Also check nested query structures
      if(cred.query?.format) {
        if(Array.isArray(cred.query.format)) {
          cred.query.format.forEach(f => formats.add(f));
        } else if(typeof cred.query.format === 'string') {
          formats.add(cred.query.format);
        }
      }
    }
  }

  return Array.from(formats);
}

/**
 * Filter wallets by format support.
 * Returns wallet IDs that support at least one of the provided formats.
 *
 * @param {object} options - Options object.
 * @param {Array<string>} options.walletIds - Array of wallet IDs to check.
 * @param {Array<string>} options.formats - Array of credential formats.
 * @param {object} [options.registry=WALLETS_REGISTRY] - Wallet registry to use.
 * @returns {Array<string>} Array of wallet IDs that support at least one
 *   format.
 */
export function filterWalletsByFormatSupport({
  walletIds, formats, registry = WALLETS_REGISTRY
}) {
  if(!Array.isArray(walletIds) || !Array.isArray(formats) ||
    formats.length === 0) {
    return [];
  }

  const supportedWallets = new Set();

  // For each format, get wallets that support it
  for(const format of formats) {
    const walletsForFormat = getWalletsSupportingFormat({
      walletIds,
      format,
      registry
    });
    walletsForFormat.forEach(walletId => supportedWallets.add(walletId));
  }

  return Array.from(supportedWallets);
}

const OID4VP_PROTOCOLS = [
  'OID4VP-draft18', 'OID4VP-1.0', 'OID4VP-combined',
  'OID4VP', 'OID4VP-haip-1.0', '18013-7-Annex-B'
];

/**
 * Build an extended wallet registry that includes protocol wallets for
 * user-enabled protocol variants that are available in the exchange.
 *
 * @param {object} options - Options object.
 * @param {Array<string>} options.enabledWallets - Wallet IDs that are enabled.
 * @param {Array<string>} options.enabledProtocols - User-enabled protocol IDs.
 * @param {Array<string>} options.availableProtocols - Protocol IDs available
 *   in the exchange.
 * @param {Array<string>} options.formats - Credential formats from workflow.
 * @param {object} options.registry - Base wallet registry.
 * @param {string} [options.OID4VPdefault] - Default OID4VP protocol ID.
 * @returns {{extendedRegistry: object, extendedWalletIds: Array<string>}}
 *   Extended registry with protocol wallets and combined wallet IDs.
 */
export function buildExtendedRegistryForPicker({
  enabledWallets = [],
  enabledProtocols = [],
  availableProtocols = [],
  formats = [],
  registry = WALLETS_REGISTRY,
  OID4VPdefault
}) {
  const extendedRegistry = {...registry};
  const extendedWalletIdsSet = new Set(enabledWallets);

  // Protocols to exclude (DC API only, no qr/link in protocol wallet)
  const excludedProtocols = ['18013-7-Annex-C', '18013-7-Annex-D'];

  // Determine which protocols qualify: in availableProtocols AND
  // (in enabledProtocols OR is OID4VPdefault)
  const qualifyingProtocols = availableProtocols.filter(protocolId => {
    if(excludedProtocols.includes(protocolId)) {
      return false;
    }
    return enabledProtocols.includes(protocolId) ||
      protocolId === OID4VPdefault;
  });

  // For each qualifying protocol, check format overlap and create protocol
  // wallet
  for(const protocolId of qualifyingProtocols) {
    const protocolFormats = PROTOCOL_FORMAT_MAPPING[protocolId];
    if(!protocolFormats || protocolFormats.length === 0) {
      continue;
    }

    // Check format overlap: protocol must support at least one requested format
    const hasFormatOverlap = formats.some(format =>
      protocolFormats.includes(format));
    if(!hasFormatOverlap) {
      continue;
    }

    // Create protocol wallet
    const protocolWallet = createProtocolWallet(protocolId);
    if(!protocolWallet || !protocolWallet.id) {
      continue;
    }

    // Add to extended registry
    extendedRegistry[protocolWallet.id] = protocolWallet;

    // Add wallet ID to extended set (dedupe handled by Set)
    extendedWalletIdsSet.add(protocolWallet.id);
  }

  return {
    extendedRegistry,
    extendedWalletIds: Array.from(extendedWalletIdsSet)
  };
}

function _getQrLinkCompatibleWallets({
  walletIds, formats, exchange, protocolId, registry,
  methods = ['qr', 'link']
}) {
  const result = [];
  for(const walletId of walletIds) {
    const wallet = registry[walletId];
    if(!wallet || !wallet.supportedProtocols) {
      continue;
    }
    const protocolConfig = wallet.supportedProtocols[protocolId];
    if(!protocolConfig) {
      continue;
    }
    for(const [method, methodConfig] of Object.entries(protocolConfig)) {
      if(!methodConfig?.formats || !methods.includes(method)) {
        continue;
      }
      if(formats.some(f => methodConfig.formats.includes(f)) &&
        exchange?.protocols?.[protocolId]) {
        result.push(walletId);
        break;
      }
    }
  }
  return result;
}

/**
 * Build picker option objects for the interaction method picker.
 *
 * @param {object} options - Options object.
 * @param {Array<string>} options.formats - Credential formats from workflow.
 * @param {object} options.exchange - Exchange object with protocols.
 * @param {Array<string>} options.availableProtocols - Protocol IDs
 *   from exchange.
 * @param {Array<string>} options.enabledWallets - Wallet IDs
 *   (options.wallets + user).
 * @param {boolean} [options.dcApiSystemAvailable=false] - DC API available.
 * @param {boolean} [options.dcApiErrorOverride=false] - Hide dcapi after error.
 * @param {object} [options.workflow] - Workflow (dcApiEnabled check).
 * @param {object} [options.registry=WALLETS_REGISTRY] - Wallet registry.
 * @returns {Array<{method: string, protocolId?: string, walletId?: string,
 *   labelKey?: string, walletIds: string[]}>}
 *   Picker option objects for the interaction method picker.
 */
export function getPickerOptions({
  formats,
  exchange = {},
  availableProtocols = [],
  enabledWallets = [],
  dcApiSystemAvailable = false,
  dcApiErrorOverride = false,
  workflow = {},
  registry = WALLETS_REGISTRY
}) {
  if(!Array.isArray(formats) || formats.length === 0) {
    return [];
  }

  const compatibleWallets = filterWalletsByFormatSupport({
    walletIds: enabledWallets,
    formats,
    registry
  });

  if(compatibleWallets.length === 0) {
    return [];
  }

  const options = [];
  const oid4vpInExchange = availableProtocols.filter(p =>
    OID4VP_PROTOCOLS.includes(p));

  const hasDcApi = () => {
    if(!dcApiSystemAvailable || dcApiErrorOverride ||
      workflow?.dcApiEnabled === false) {
      return false;
    }
    for(const walletId of compatibleWallets) {
      for(const format of formats) {
        const combos = getProtocolInteractionMethods({
          walletId, format, exchange, registry
        });
        const match = combos.find(c =>
          c.interactionMethod === 'dcapi' &&
          !['chapi', 'vcapi', 'interact'].includes(c.protocolId) &&
          (format === 'mso_mdoc' ||
            c.protocolId === '18013-7-Annex-D' ||
            c.protocolId === 'OID4VP-HAIP-1.0'));
        if(match) {
          return true;
        }
      }
    }
    return false;
  };

  const getDcApiWallets = () => compatibleWallets.filter(w => {
    for(const format of formats) {
      const combos = getProtocolInteractionMethods({
        walletId: w, format, exchange, registry
      });
      if(combos.some(c =>
        c.interactionMethod === 'dcapi' &&
        ['18013-7-Annex-C', '18013-7-Annex-D'].includes(c.protocolId))) {
        return true;
      }
    }
    return false;
  });

  const getChapiWallets = () => compatibleWallets.filter(w => {
    for(const format of formats) {
      const combos = getProtocolInteractionMethods({
        walletId: w, format, exchange, registry
      });
      if(combos.some(c =>
        c.interactionMethod === 'chapi' || c.protocolId === 'chapi')) {
        return true;
      }
    }
    return false;
  });

  const getInteractCopyWallets = () => compatibleWallets.filter(w => {
    for(const format of formats) {
      const combos = getProtocolInteractionMethods({
        walletId: w, format, exchange, registry
      });
      if(combos.some(c =>
        c.protocolId === 'interact' &&
        (c.interactionMethod === 'qr' || c.interactionMethod === 'copy'))) {
        return true;
      }
    }
    return false;
  });

  if(hasDcApi()) {
    options.push({method: 'dcapi', walletIds: getDcApiWallets()});
  }

  const chapiWallets = getChapiWallets();
  if(chapiWallets.length > 0 && availableProtocols.includes('chapi')) {
    options.push({method: 'chapi', walletIds: chapiWallets});
  }

  const interactWallets = getInteractCopyWallets();
  if(interactWallets.length > 0 && availableProtocols.includes('interact')) {
    options.push({
      method: 'qr-and-copy',
      protocolId: 'interact',
      walletIds: interactWallets
    });
  }

  const oid4vpWithWallets = oid4vpInExchange
    .map(protocolId => ({
      protocolId,
      walletIds: _getQrLinkCompatibleWallets({
        walletIds: compatibleWallets,
        formats,
        exchange,
        protocolId,
        registry
      })
    }))
    .filter(p => p.walletIds.length > 0);

  if(oid4vpWithWallets.length === 1) {
    options.push({
      method: 'qr-and-link',
      protocolId: oid4vpWithWallets[0].protocolId,
      walletIds: oid4vpWithWallets[0].walletIds
    });
  } else if(oid4vpWithWallets.length > 1) {
    const ordered = oid4vpWithWallets.sort((a, b) => {
      const aIdx = PROTOCOL_PRIORITY.indexOf(a.protocolId);
      const bIdx = PROTOCOL_PRIORITY.indexOf(b.protocolId);
      return (aIdx === -1 ? Infinity : aIdx) - (bIdx === -1 ? Infinity : bIdx);
    });
    for(const {protocolId, walletIds} of ordered) {
      options.push({
        method: 'qr-and-link',
        protocolId,
        walletIds
      });
    }
  }

  if(availableProtocols.includes('vcapi')) {
    if(enabledWallets.includes('lcw')) {
      const lcwVcapi = _getQrLinkCompatibleWallets({
        walletIds: ['lcw'],
        formats,
        exchange,
        protocolId: 'vcapi',
        registry,
        methods: ['qr', 'link', 'copy']
      });
      if(lcwVcapi.length > 0) {
        options.push({
          method: 'qr-and-link',
          protocolId: 'vcapi',
          walletId: 'lcw',
          labelKey: 'interactionMethod_qr-and-link_lcw',
          walletIds: ['lcw']
        });
      }
    }
  }

  options.sort((a, b) => {
    const aIdx = INTERACTION_METHOD_PRIORITY.indexOf(a.method);
    const bIdx = INTERACTION_METHOD_PRIORITY.indexOf(b.method);
    return (aIdx === -1 ? Infinity : aIdx) - (bIdx === -1 ? Infinity : bIdx);
  });

  return options;
}

/**
 * Select initial protocol/interaction method combination based on priority.
 * Prioritizes same-device methods (dcapi, link) on mobile platforms.
 *
 * @param {object} options - Options object.
 * @param {Array<string>} options.walletIds - Array of wallet IDs to consider.
 * @param {Array<string>} options.formats - Array of credential formats.
 * @param {object} options.exchange - Exchange object with protocols property.
 * @param {boolean} options.isMobile - Whether platform is mobile.
 * @param {object} [options.registry=WALLETS_REGISTRY] - Wallet registry to use.
 * @returns {{walletId: string, protocolId: string, interactionMethod: string,
 *   request: string|object}|null} First available combination or null.
 */
export function selectInitialProtocolInteraction({
  walletIds, formats, exchange, isMobile, registry = WALLETS_REGISTRY
}) {
  if(!Array.isArray(walletIds) || walletIds.length === 0 ||
    !Array.isArray(formats) || formats.length === 0) {
    return null;
  }

  // Collect all protocol/interaction combinations for all wallets and formats
  const candidates = [];

  for(const walletId of walletIds) {
    for(const format of formats) {
      const combinations = getProtocolInteractionMethods({
        walletId,
        format,
        exchange,
        registry
      });

      for(const combo of combinations) {
        candidates.push({
          walletId,
          format,
          ...combo,
          // Store priority indices for sorting
          _interactionPriority: INTERACTION_METHOD_PRIORITY.indexOf(
            combo.interactionMethod),
          _protocolPriority: PROTOCOL_PRIORITY.indexOf(combo.protocolId)
        });
      }
    }
  }

  if(candidates.length === 0) {
    return null;
  }

  // Sort by interaction method priority (adjusted for mobile),
  // then by protocol priority
  candidates.sort((a, b) => {
    // Handle missing priorities
    const aInteractionPriority = a._interactionPriority === -1 ?
      Infinity : a._interactionPriority;
    const bInteractionPriority = b._interactionPriority === -1 ?
      Infinity : b._interactionPriority;

    // On mobile, prioritize same-device methods (dcapi, link)
    let aAdjustedPriority = aInteractionPriority;
    let bAdjustedPriority = bInteractionPriority;

    if(isMobile) {
      // dcapi and link (indices 0 and 1) should be prioritized
      // qr (index 2) should be deprioritized
      if(aInteractionPriority === 2) { // qr
        aAdjustedPriority = Infinity;
      }
      if(bInteractionPriority === 2) { // qr
        bAdjustedPriority = Infinity;
      }
    }

    if(aAdjustedPriority !== bAdjustedPriority) {
      return aAdjustedPriority - bAdjustedPriority;
    }

    const aProtocolPriority = a._protocolPriority === -1 ?
      Infinity : a._protocolPriority;
    const bProtocolPriority = b._protocolPriority === -1 ?
      Infinity : b._protocolPriority;

    return aProtocolPriority - bProtocolPriority;
  });

  // Return first candidate (remove temporary priority fields)
  const selected = candidates[0];
  return {
    walletId: selected.walletId,
    protocolId: selected.protocolId,
    interactionMethod: selected.interactionMethod,
    request: selected.request
  };
}
