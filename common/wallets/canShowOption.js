/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  extractCredentialFormats,
  getProtocolInteractionMethods,
  PROTOCOL_FORMAT_MAPPING
} from './index.js';
import {WALLETS_REGISTRY} from './wallets-registry.js';

const STORAGE_KEY = 'opencred-app-settings';

/**
 * Default user settings when none are stored.
 */
export const DEFAULT_USER_SETTINGS = {
  enabledWallets: Object.keys(WALLETS_REGISTRY),
  enabledProtocols: []
};

/**
 * Load user settings from localStorage.
 *
 * @returns {object} User settings.
 */
export function loadUserSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if(!stored) {
      return {...DEFAULT_USER_SETTINGS};
    }
    const parsed = JSON.parse(stored);
    return {
      enabledWallets: Array.isArray(parsed.enabledWallets) ?
        parsed.enabledWallets : DEFAULT_USER_SETTINGS.enabledWallets,
      enabledProtocols: Array.isArray(parsed.enabledProtocols) ?
        parsed.enabledProtocols : DEFAULT_USER_SETTINGS.enabledProtocols
    };
  } catch {
    return {...DEFAULT_USER_SETTINGS};
  }
}

/**
 * Save user settings to localStorage.
 *
 * @param {object} settings - User settings.
 */
export function saveUserSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      enabledWallets: settings.enabledWallets || [],
      enabledProtocols: settings.enabledProtocols || []
    }));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Determine whether a wallet or protocol option can be shown for the given
 * context. Single source of truth for availability.
 *
 * @param {object} options - Options object.
 * @param {object} options.workflow - Workflow with query.
 * @param {Array<string>} options.availableProtocols - Protocols from exchange.
 * @param {object} options.exchange - Exchange object with protocols.
 * @param {object} options.platform - Platform info
 *   { isIOS, isAndroid, isMobile }.
 * @param {object} options.userSettings - { enabledWallets, enabledProtocols }.
 * @param {boolean} [options.dcApiSystemAvailable=false] - DC API available.
 * @param {string} [options.walletId] - Wallet ID to check.
 * @param {string} [options.protocolId] - Protocol ID to check
 *   (for protocol wallet).
 * @returns {{ available: boolean }} Result.
 */
export function canShowOption({
  workflow,
  availableProtocols = [],
  exchange = {},
  platform = {},
  userSettings = {},
  dcApiSystemAvailable = false,
  walletId,
  protocolId
}) {
  const formats = extractCredentialFormats(workflow);
  if(formats.length === 0) {
    return {available: false};
  }

  const enabledWallets = userSettings.enabledWallets ||
    DEFAULT_USER_SETTINGS.enabledWallets;
  const enabledProtocols = userSettings.enabledProtocols ||
    DEFAULT_USER_SETTINGS.enabledProtocols;

  if(walletId) {
    return _canShowWallet({
      walletId,
      formats,
      availableProtocols,
      exchange,
      platform,
      enabledWallets,
      dcApiSystemAvailable
    });
  }

  if(protocolId) {
    return _canShowProtocol({
      protocolId,
      formats,
      availableProtocols,
      platform,
      enabledProtocols,
      dcApiSystemAvailable
    });
  }

  return {available: false};
}

function _canShowWallet({
  walletId,
  formats,
  availableProtocols,
  exchange,
  platform,
  enabledWallets,
  dcApiSystemAvailable
}) {
  if(!enabledWallets.includes(walletId)) {
    return {available: false};
  }

  const wallet = WALLETS_REGISTRY[walletId];
  if(!wallet || !wallet.supportedFormats) {
    return {available: false};
  }

  const formatOverlap = formats.some(f => wallet.supportedFormats.includes(f));
  if(!formatOverlap) {
    return {available: false};
  }

  for(const format of formats) {
    if(!wallet.supportedFormats.includes(format)) {
      continue;
    }
    const combinations = getProtocolInteractionMethods({
      walletId,
      format,
      exchange,
      registry: WALLETS_REGISTRY
    });
    for(const combo of combinations) {
      if(!availableProtocols.includes(combo.protocolId)) {
        continue;
      }
      if(combo.interactionMethod === 'dcapi') {
        if(!dcApiSystemAvailable) {
          continue;
        }
        if(combo.protocolId === '18013-7-Annex-C' && !platform.isIOS) {
          continue;
        }
        if(combo.protocolId === '18013-7-Annex-D' && !platform.isAndroid) {
          continue;
        }
      }
      return {available: true};
    }
  }

  return {available: false};
}

function _canShowProtocol({
  protocolId,
  formats,
  availableProtocols,
  platform,
  enabledProtocols,
  dcApiSystemAvailable
}) {
  if(!enabledProtocols.includes(protocolId)) {
    return {available: false};
  }

  if(!availableProtocols.includes(protocolId)) {
    return {available: false};
  }

  const protocolFormats = PROTOCOL_FORMAT_MAPPING[protocolId];
  if(!protocolFormats || !Array.isArray(protocolFormats)) {
    return {available: false};
  }

  const formatOverlap = formats.some(f => protocolFormats.includes(f));
  if(!formatOverlap) {
    return {available: false};
  }

  if(['18013-7-Annex-C', '18013-7-Annex-D'].includes(protocolId)) {
    if(!dcApiSystemAvailable) {
      return {available: false};
    }
    if(protocolId === '18013-7-Annex-C' && !platform.isIOS) {
      return {available: false};
    }
    if(protocolId === '18013-7-Annex-D' && !platform.isAndroid) {
      return {available: false};
    }
  }

  return {available: true};
}

/**
 * Get all wallet IDs that can be shown for the context.
 *
 * @param {object} options - Same as canShowOption (without
 *   walletId/protocolId).
 * @returns {Array<string>} Wallet IDs.
 */
export function getAvailableWalletIds(options) {
  const walletIds = options.userSettings?.enabledWallets ||
    Object.keys(WALLETS_REGISTRY);
  return walletIds.filter(walletId =>
    canShowOption({...options, walletId}).available
  );
}

/**
 * Get all protocol IDs that can be shown for the context.
 *
 * @param {object} options - Same as canShowOption (without
 *   walletId/protocolId).
 * @returns {Array<string>} Protocol IDs.
 */
export function getAvailableProtocolIds(options) {
  const protocolIds = options.userSettings?.enabledProtocols || [];
  return protocolIds.filter(protocolId =>
    canShowOption({...options, protocolId}).available
  );
}
