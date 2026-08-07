/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PROFILE_FORMAT_MAPPING} from './profile-format-mapping.js';
import {WALLETS_REGISTRY} from './wallets-registry.js';

export {PROFILE_FORMAT_MAPPING};
export {
  canShowOption,
  DEFAULT_USER_SETTINGS,
  getAvailableProfileIds,
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
 * Global priority order for profiles.
 * Higher priority profiles appear first in ordered lists.
 */
export const PROFILE_PRIORITY = [
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
 * Get ordered list of profile/interaction method combinations for a wallet
 * and format.
 *
 * @param {object} options - Options object.
 * @param {string} options.walletId - Wallet ID.
 * @param {string} options.format - Credential format ('ldp_vc', 'jwt_vc_json',
 *   or 'mso_mdoc').
 * @param {object} options.exchange - Exchange object with protocols property.
 * @param {object} [options.registry=WALLETS_REGISTRY] - Wallet registry to use.
 * @returns {Array<{profile: string, request: string|object,
 *   interactionMethod: string}>}
 *   Ordered array of profile/interaction method combinations.
 */
export function getProtocolInteractionMethods({
  walletId, format, exchange, registry = WALLETS_REGISTRY
}) {
  if(!walletId || !format) {
    return [];
  }

  const wallet = registry[walletId];
  if(!wallet || !wallet.supportedProfiles) {
    return [];
  }

  // Collect all profile/interaction method pairs that support the format
  const candidates = [];

  for(const [profile, profileConfig] of Object.entries(
    wallet.supportedProfiles)) {
    if(!profileConfig || typeof profileConfig !== 'object') {
      continue;
    }

    for(const [interactionMethod, methodConfig] of Object.entries(
      profileConfig)) {
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
          request = methodConfig.getUrl({exchange, protocol: profile});
        } else {
          request = getUrlDefault({exchange, protocol: profile});
        }
      } else if(['dcapi', 'chapi'].includes(interactionMethod)) {
        // For dcapi and chapi, use getRequest if available, otherwise
        // use protocol URL
        if(typeof methodConfig.getRequest === 'function') {
          request = methodConfig.getRequest({exchange, protocol: profile});
        } else if(exchange?.protocols?.[profile]) {
          // Return protocol URL as placeholder - actual request construction
          // may require async operations
          request = exchange.protocols[profile];
        }
      }

      // Only add if we have a valid request
      if(request !== null && request !== undefined) {
        candidates.push({
          profile,
          interactionMethod,
          request,
          // Store priority indices for sorting
          _interactionPriority: INTERACTION_METHOD_PRIORITY.indexOf(
            interactionMethod),
          _profilePriority: PROFILE_PRIORITY.indexOf(profile)
        });
      }
    }
  }

  // Sort by interaction method priority first, then profile priority
  candidates.sort((a, b) => {
    // Handle missing priorities (shouldn't happen, but be safe)
    const aInteractionPriority = a._interactionPriority === -1 ?
      Infinity : a._interactionPriority;
    const bInteractionPriority = b._interactionPriority === -1 ?
      Infinity : b._interactionPriority;

    if(aInteractionPriority !== bInteractionPriority) {
      return aInteractionPriority - bInteractionPriority;
    }

    const aProfilePriority = a._profilePriority === -1 ?
      Infinity : a._profilePriority;
    const bProfilePriority = b._profilePriority === -1 ?
      Infinity : b._profilePriority;

    return aProfilePriority - bProfilePriority;
  });

  // Remove temporary priority fields
  return candidates.map(({
    // eslint-disable-next-line no-unused-vars
    _interactionPriority, _profilePriority, ...rest
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

/**
 * Select initial profile/interaction method combination based on priority.
 * Prioritizes same-device methods (dcapi, link) on mobile platforms.
 *
 * @param {object} options - Options object.
 * @param {Array<string>} options.walletIds - Array of wallet IDs to consider.
 * @param {Array<string>} options.formats - Array of credential formats.
 * @param {object} options.exchange - Exchange object with protocols property.
 * @param {boolean} options.isMobile - Whether platform is mobile.
 * @param {object} [options.registry=WALLETS_REGISTRY] - Wallet registry to use.
 * @returns {{walletId: string, profile: string, interactionMethod: string,
 *   request: string|object}|null} First available combination or null.
 */
export function selectInitialProtocolInteraction({
  walletIds, formats, exchange, isMobile, registry = WALLETS_REGISTRY
}) {
  if(!Array.isArray(walletIds) || walletIds.length === 0 ||
    !Array.isArray(formats) || formats.length === 0) {
    return null;
  }

  // Collect all profile/interaction combinations for all wallets and formats
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
          _profilePriority: PROFILE_PRIORITY.indexOf(combo.profile)
        });
      }
    }
  }

  if(candidates.length === 0) {
    return null;
  }

  // Sort by interaction method priority (adjusted for mobile),
  // then by profile priority
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

    const aProfilePriority = a._profilePriority === -1 ?
      Infinity : a._profilePriority;
    const bProfilePriority = b._profilePriority === -1 ?
      Infinity : b._profilePriority;

    return aProfilePriority - bProfilePriority;
  });

  // Return first candidate (remove temporary priority fields)
  const selected = candidates[0];
  return {
    walletId: selected.walletId,
    profile: selected.profile,
    interactionMethod: selected.interactionMethod,
    request: selected.request
  };
}

/**
 * Resolve a wallet's device-context name — what it is called on the surface
 * where it is launched. Key-first with a literal fallback, then the wallet id,
 * matching the precedence the launch surfaces already use.
 *
 * @param {object} options - Options object.
 * @param {object} options.wallet - Wallet definition or exchange-option entry
 *   carrying `name`/`nameKey`.
 * @param {Function} [options.t] - The i18n translate function; a key with no
 *   translation resolves to itself and is treated as absent.
 * @param {string} [options.fallbackId] - Last-resort label, usually the
 *   wallet id.
 * @returns {string} The resolved device-context name.
 */
export function resolveDeviceContextName({wallet, t, fallbackId} = {}) {
  const key = wallet?.nameKey;
  if(key && typeof t === 'function') {
    const translated = t(key);
    if(translated && translated !== key) {
      return translated;
    }
  }
  return wallet?.name || fallbackId;
}

/**
 * Resolve a wallet's product name — its app-store identity, shown where the
 * user is invited to install an app. Key-first with a literal fallback, then
 * falls back to the device-context name, so only a wallet that genuinely
 * differs between the two needs to declare both.
 *
 * @param {object} options - Options object.
 * @param {object} options.wallet - Wallet definition or exchange-option entry
 *   carrying `productName`/`productNameKey` and `name`/`nameKey`.
 * @param {Function} [options.t] - The i18n translate function; a key with no
 *   translation resolves to itself and is treated as absent.
 * @param {string} [options.fallbackId] - Last-resort label, usually the
 *   wallet id.
 * @returns {string} The resolved product name.
 */
export function resolveProductName({wallet, t, fallbackId} = {}) {
  const key = wallet?.productNameKey;
  if(key && typeof t === 'function') {
    const translated = t(key);
    if(translated && translated !== key) {
      return translated;
    }
  }
  if(wallet?.productName) {
    return wallet.productName;
  }
  return resolveDeviceContextName({wallet, t, fallbackId});
}

/**
 * Expand legacy wallet ID aliases to their current equivalents.
 * E.g., 'cadmv-wallet' → ['cadmv-android', 'cadmv-ios'].
 *
 * @param {Array<string>} walletIds - Array of wallet IDs (may contain
 *   aliases).
 * @returns {Array<string>} Expanded array with aliases replaced (deduped).
 */
export function expandWalletAliases(walletIds) {
  if(!Array.isArray(walletIds)) {
    return [];
  }
  const ALIASES = {
    'cadmv-wallet': ['cadmv-android', 'cadmv-ios']
  };
  const result = [];
  for(const id of walletIds) {
    if(ALIASES[id]) {
      result.push(...ALIASES[id]);
    } else {
      result.push(id);
    }
  }
  return [...new Set(result)];
}
