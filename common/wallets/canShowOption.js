/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  extractCredentialFormats,
  getProtocolInteractionMethods,
  PROFILE_FORMAT_MAPPING
} from './index.js';
import {WALLETS_REGISTRY} from './wallets-registry.js';

const STORAGE_KEY = 'opencred-app-settings';

/**
 * Default user settings when none are stored.
 */
export const DEFAULT_USER_SETTINGS = {
  enabledWallets: [],
  enabledProfiles: []
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
      enabledProfiles: Array.isArray(parsed.enabledProfiles) ?
        parsed.enabledProfiles : DEFAULT_USER_SETTINGS.enabledProfiles
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
      enabledProfiles: settings.enabledProfiles || []
    }));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Determine whether a wallet or profile option can be shown for the given
 * context. Single source of truth for availability.
 *
 * @param {object} options - Options object.
 * @param {object} options.workflow - Workflow with query.
 * @param {Array<string>} options.availableProfiles - Profiles from exchange.
 * @param {object} options.exchange - Exchange object with protocols.
 * @param {object} options.platform - Platform info
 *   { isIOS, isAndroid, isMobile }.
 * @param {object} options.userSettings - { enabledWallets, enabledProfiles }.
 * @param {boolean} [options.dcApiSystemAvailable=false] - DC API available.
 * @param {string} [options.walletId] - Wallet ID to check.
 * @param {string} [options.profile] - Profile ID to check
 *   (for profile option).
 * @returns {{ available: boolean }} Result.
 */
export function canShowOption({
  workflow,
  availableProfiles = [],
  exchange = {},
  platform = {},
  userSettings = {},
  dcApiSystemAvailable = false,
  walletId,
  profile
}) {
  const formats = extractCredentialFormats(workflow);
  if(formats.length === 0) {
    return {available: false};
  }

  const enabledWallets = userSettings.enabledWallets ||
    DEFAULT_USER_SETTINGS.enabledWallets;
  const enabledProfiles = userSettings.enabledProfiles ||
    DEFAULT_USER_SETTINGS.enabledProfiles;

  if(walletId) {
    return _canShowWallet({
      walletId,
      formats,
      availableProfiles,
      exchange,
      platform,
      enabledWallets,
      dcApiSystemAvailable
    });
  }

  if(profile) {
    return _canShowProfile({
      profile,
      formats,
      availableProfiles,
      platform,
      enabledProfiles,
      dcApiSystemAvailable
    });
  }

  return {available: false};
}

function _canShowWallet({
  walletId,
  formats,
  availableProfiles,
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

  // Platform filtering: on mobile, only show wallets for that platform.
  // On desktop (neither iOS nor Android), show all for cross-device flows.
  if(wallet.platform && Array.isArray(wallet.platform)) {
    if(platform.isIOS && !wallet.platform.includes('ios')) {
      return {available: false};
    }
    if(platform.isAndroid && !wallet.platform.includes('android')) {
      return {available: false};
    }
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
      if(!availableProfiles.includes(combo.profile)) {
        continue;
      }
      if(combo.interactionMethod === 'dcapi') {
        if(!dcApiSystemAvailable) {
          continue;
        }
      }
      return {available: true};
    }
  }

  return {available: false};
}

function _canShowProfile({
  profile,
  formats,
  availableProfiles,
  platform,
  enabledProfiles,
  dcApiSystemAvailable
}) {
  if(!enabledProfiles.includes(profile)) {
    return {available: false};
  }

  if(!availableProfiles.includes(profile)) {
    return {available: false};
  }

  const profileFormats = PROFILE_FORMAT_MAPPING[profile];
  if(!profileFormats || !Array.isArray(profileFormats)) {
    return {available: false};
  }

  const formatOverlap = formats.some(f => profileFormats.includes(f));
  if(!formatOverlap) {
    return {available: false};
  }

  if(['18013-7-Annex-C', '18013-7-Annex-D'].includes(profile)) {
    if(!dcApiSystemAvailable) {
      return {available: false};
    }
    if(profile === '18013-7-Annex-C' && !platform.isIOS) {
      return {available: false};
    }
    if(profile === '18013-7-Annex-D' && !platform.isAndroid) {
      return {available: false};
    }
  }

  return {available: true};
}

/**
 * Get all wallet IDs that can be shown for the context.
 *
 * @param {object} options - Same as canShowOption (without
 *   walletId/profile).
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
 * Get all profile IDs that can be shown for the context.
 *
 * @param {object} options - Same as canShowOption (without
 *   walletId/profile).
 * @returns {Array<string>} Profile IDs.
 */
export function getAvailableProfileIds(options) {
  const profileIds = options.userSettings?.enabledProfiles || [];
  return profileIds.filter(profile =>
    canShowOption({...options, profile}).available
  );
}
