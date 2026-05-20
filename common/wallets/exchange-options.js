/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  extractCredentialFormats,
  INTERACTION_METHOD_PRIORITY,
  PROFILE_PRIORITY
} from './index.js';
import {PROFILE_FORMAT_MAPPING} from './profile-format-mapping.js';
import {PROFILES_LIST} from '../profiles.js';
import {WALLETS_REGISTRY} from './wallets-registry.js';

const DC_API_ONLY_PROFILES = ['18013-7-Annex-C', '18013-7-Annex-D'];

const OID4VP_PROFILES = [
  'OID4VP-draft18', 'OID4VP-1.0', 'OID4VP-combined',
  'OID4VP', 'OID4VP-haip-1.0', '18013-7-Annex-B'
];

const DC_API_AGGREGATOR_PROFILES = [
  '18013-7-Annex-C', '18013-7-Annex-D',
  'cadmv-android', 'cadmv-ios',
  'google-wallet', 'apple-wallet'
];

/**
 * Compute the unified set of options for the current exchange.
 *
 * @param {object} input - Input parameters.
 * @param {object} input.workflow - Workflow configuration
 *   (used for `query`/`dcql_query` to derive formats).
 * @param {object} input.exchange - Exchange object;
 *   `exchange.protocols` keys are profile IDs.
 * @param {Array<string>} input.systemWallets - Wallet IDs
 *   from `workflow.wallets || options.wallets`,
 *   alias-expanded via `expandWalletAliases`.
 * @param {string} [input.oid4vpDefaultProfile]
 *   `options.OID4VPdefault` (e.g. 'OID4VP-1.0').
 * @param {object} input.userSettings
 *   `{enabledWallets, enabledProfiles}` from `loadUserSettings`.
 * @param {object} input.platform
 *   `{isIOS, isAndroid, isMobile}`.
 * @param {boolean} [input.dcApiSystemAvailable=false] - Whether
 *   the DC API is available in the browser.
 * @param {object} [input.registry=WALLETS_REGISTRY] - Wallet
 *   registry to use.
 * @returns {{
 *   defaultWallets: Array<object>,
 *   extraWallets: Array<object>,
 *   defaultProfiles: Array<object>,
 *   extraProfiles: Array<object>,
 *   pickerEntries: Array<object>
 * }} The computed exchange options.
 */
export function computeExchangeOptions(input) {
  const {
    workflow,
    exchange,
    systemWallets = [],
    oid4vpDefaultProfile,
    userSettings = {},
    platform = {},
    dcApiSystemAvailable = false,
    registry = WALLETS_REGISTRY
  } = input;

  const formats = extractCredentialFormats(workflow);
  const availableProfiles = Object.keys(exchange?.protocols ?? {});
  const systemSet = new Set(systemWallets);
  const enabledUserWallets = userSettings.enabledWallets || [];
  const enabledUserProfiles = userSettings.enabledProfiles || [];

  // --- 1. Wallets ---
  const defaultWallets = [];
  const extraWallets = [];

  for(const walletId of Object.keys(registry)) {
    const wallet = registry[walletId];
    const compat = _walletCompat({
      wallet, formats, availableProfiles, platform, dcApiSystemAvailable
    });
    if(!compat.compatible) {
      continue;
    }
    const entry = {
      walletId,
      ...(wallet.name && {name: wallet.name}),
      ...(wallet.nameKey && {nameKey: wallet.nameKey}),
      ...(wallet.icon && {icon: wallet.icon}),
      supportedMethods: compat.methods
    };
    if(systemSet.has(walletId)) {
      defaultWallets.push(entry);
    } else {
      extraWallets.push({
        ...entry,
        enabled: enabledUserWallets.includes(walletId)
      });
    }
  }

  // --- 2. Profiles ---
  const defaultProfiles = [];
  const defaultProfileSet = new Set();

  if(oid4vpDefaultProfile) {
    const compat = _profileCompat({
      profile: oid4vpDefaultProfile, formats, availableProfiles,
      platform, dcApiSystemAvailable
    });
    if(compat.compatible) {
      defaultProfiles.push({
        profile: oid4vpDefaultProfile,
        nameKey: `profiles_${oid4vpDefaultProfile}_name`,
        supportedMethods: compat.methods,
        walletIds: _walletsForProfile(oid4vpDefaultProfile, registry)
      });
      defaultProfileSet.add(oid4vpDefaultProfile);
    }
  }

  // interact is default when available AND interactEnabled is not false.
  // When interactEnabled is false, interact defaults through to
  // extraProfiles so users can still opt in via advanced settings.
  const interactDefault = (workflow?.interactEnabled ?? true) !== false;
  if(interactDefault && !defaultProfileSet.has('interact')) {
    const compat = _profileCompat({
      profile: 'interact', formats, availableProfiles,
      platform, dcApiSystemAvailable
    });
    if(compat.compatible) {
      defaultProfiles.push({
        profile: 'interact',
        nameKey: 'profiles_interact_name',
        supportedMethods: compat.methods,
        walletIds: _walletsForProfile('interact', registry)
      });
      defaultProfileSet.add('interact');
    }
  }

  const excludedFromExtras = new Set([...defaultProfileSet, 'vcapi']);
  const extraProfiles = [];
  for(const profile of PROFILES_LIST) {
    if(excludedFromExtras.has(profile)) {
      continue;
    }
    const compat = _profileCompat({
      profile, formats, availableProfiles, platform, dcApiSystemAvailable
    });
    if(!compat.compatible) {
      continue;
    }
    extraProfiles.push({
      profile,
      nameKey: `profiles_${profile}_name`,
      supportedMethods: compat.methods,
      walletIds: _walletsForProfile(profile, registry),
      enabled: enabledUserProfiles.includes(profile)
    });
  }

  // --- 3. Picker entries ---
  const enabledWalletIds = new Set([
    ...defaultWallets.map(w => w.walletId),
    ...extraWallets.filter(w => w.enabled).map(w => w.walletId)
  ]);
  const enabledProfileIds = new Set([
    ...defaultProfiles.map(p => p.profile),
    ...extraProfiles.filter(p => p.enabled).map(p => p.profile)
  ]);

  const dcApiOk = dcApiSystemAvailable && workflow?.dcApiEnabled !== false;
  const pickerEntries = _buildPickerEntries({
    enabledWalletIds, enabledProfileIds, availableProfiles,
    formats, exchange, dcApiOk, registry
  });

  return {
    defaultWallets, extraWallets, defaultProfiles, extraProfiles, pickerEntries
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _walletCompat({
  wallet, formats, availableProfiles, platform, dcApiSystemAvailable
}) {
  if(!wallet?.supportedFormats || !wallet.supportedProfiles) {
    return {compatible: false, methods: []};
  }
  if(!formats.some(f => wallet.supportedFormats.includes(f))) {
    return {compatible: false, methods: []};
  }
  if(Array.isArray(wallet.platform)) {
    if(platform.isIOS && !wallet.platform.includes('ios')) {
      return {compatible: false, methods: []};
    }
    if(platform.isAndroid && !wallet.platform.includes('android')) {
      return {compatible: false, methods: []};
    }
  }

  const methods = new Set();
  for(const [profile, profileCfg] of Object.entries(wallet.supportedProfiles)) {
    if(!availableProfiles.includes(profile)) {
      continue;
    }
    if(!profileCfg || typeof profileCfg !== 'object') {
      continue;
    }
    for(const [method, methodCfg] of Object.entries(profileCfg)) {
      if(!methodCfg?.formats ||
        !formats.some(f => methodCfg.formats.includes(f))) {
        continue;
      }
      if(method === 'dcapi') {
        if(dcApiSystemAvailable) {
          methods.add('dcapi');
        }
      } else if(method === 'chapi') {
        methods.add('chapi');
      } else if(method === 'qr' || method === 'link' || method === 'copy') {
        methods.add(profile === 'interact' ? 'qr-and-copy' : 'qr-and-link');
      }
    }
  }
  return methods.size > 0 ?
    {compatible: true, methods: [...methods]} :
    {compatible: false, methods: []};
}

function _profileCompat({
  profile, formats, availableProfiles, platform, dcApiSystemAvailable
}) {
  if(!availableProfiles.includes(profile)) {
    return {compatible: false, methods: []};
  }
  const pfFormats = PROFILE_FORMAT_MAPPING[profile];
  if(!pfFormats || !formats.some(f => pfFormats.includes(f))) {
    return {compatible: false, methods: []};
  }
  if(DC_API_ONLY_PROFILES.includes(profile)) {
    if(!dcApiSystemAvailable) {
      return {compatible: false, methods: []};
    }
    if(profile === '18013-7-Annex-C' && !platform.isIOS) {
      return {compatible: false, methods: []};
    }
    if(profile === '18013-7-Annex-D' && !platform.isAndroid) {
      return {compatible: false, methods: []};
    }
    return {compatible: true, methods: ['dcapi']};
  }

  const methods = [];
  if(OID4VP_PROFILES.includes(profile)) {
    methods.push('qr-and-link');
    if(dcApiSystemAvailable) {
      methods.push('dcapi');
    }
  } else if(profile === 'interact') {
    methods.push('qr-and-copy');
  } else if(profile === 'chapi') {
    methods.push('chapi');
  }
  return methods.length > 0 ?
    {compatible: true, methods} :
    {compatible: false, methods: []};
}

function _walletsForProfile(profile, registry) {
  return Object.keys(registry).filter(
    wid => registry[wid]?.supportedProfiles?.[profile]
  );
}

function _buildPickerEntries({
  enabledWalletIds, enabledProfileIds, availableProfiles,
  formats, exchange, dcApiOk, registry
}) {
  const entries = [];

  // DC API all-wallets aggregator
  if(dcApiOk) {
    const wallets = _dcApiAggregatorWallets({
      enabledWalletIds, availableProfiles, formats, registry
    });
    if(wallets.length > 0) {
      entries.push({method: 'dcapi', profile: null, walletIds: wallets});
    }
  }

  // Per-enabled-profile entries
  for(const profile of enabledProfileIds) {
    if(profile === 'vcapi' || !availableProfiles.includes(profile)) {
      continue;
    }
    if(OID4VP_PROFILES.includes(profile)) {
      entries.push({
        method: 'qr-and-link', profile,
        walletIds: _matchingWallets({
          enabledWalletIds, profile, methods: ['qr', 'link'],
          formats, exchange, registry
        })
      });
      if(dcApiOk) {
        const dcApiWallets = _matchingWallets({
          enabledWalletIds, profile, methods: ['dcapi'],
          formats, exchange, registry
        });
        if(dcApiWallets.length > 0) {
          entries.push({method: 'dcapi', profile, walletIds: dcApiWallets});
        }
      }
    } else if(DC_API_ONLY_PROFILES.includes(profile) && dcApiOk) {
      const dcApiWallets = _matchingWallets({
        enabledWalletIds, profile, methods: ['dcapi'],
        formats, exchange, registry
      });
      if(dcApiWallets.length > 0) {
        entries.push({method: 'dcapi', profile, walletIds: dcApiWallets});
      }
    } else if(profile === 'interact') {
      entries.push({
        method: 'qr-and-copy', profile: 'interact',
        walletIds: _matchingWallets({
          enabledWalletIds, profile: 'interact',
          methods: ['qr', 'copy'], formats, exchange, registry
        })
      });
    } else if(profile === 'chapi') {
      const w = _matchingWallets({
        enabledWalletIds, profile: 'chapi', methods: ['chapi'],
        formats, exchange, registry
      });
      if(w.length > 0) {
        entries.push({method: 'chapi', profile: 'chapi', walletIds: w});
      }
    }
  }

  // Wallet-implied chapi when not already covered by enabled profiles
  if(!enabledProfileIds.has('chapi') && availableProfiles.includes('chapi')) {
    const w = _matchingWallets({
      enabledWalletIds, profile: 'chapi', methods: ['chapi'],
      formats, exchange, registry
    });
    if(w.length > 0) {
      entries.push({method: 'chapi', profile: 'chapi', walletIds: w});
    }
  }

  // LCW + vcapi special case
  if(enabledWalletIds.has('lcw') && availableProfiles.includes('vcapi')) {
    const lcw = _matchingWallets({
      enabledWalletIds: new Set(['lcw']), profile: 'vcapi',
      methods: ['qr', 'link', 'copy'], formats, exchange, registry
    });
    if(lcw.length > 0) {
      entries.push({
        method: 'qr-and-link', profile: 'vcapi', walletIds: ['lcw']
      });
    }
  }

  _sortEntries(entries);
  return entries;
}

function _dcApiAggregatorWallets({
  enabledWalletIds, availableProfiles, formats, registry
}) {
  const result = [];
  for(const walletId of enabledWalletIds) {
    const wallet = registry[walletId];
    if(!wallet?.supportedProfiles) {
      continue;
    }
    for(const [profile, cfg] of Object.entries(wallet.supportedProfiles)) {
      if(!availableProfiles.includes(profile) || !cfg?.dcapi?.formats) {
        continue;
      }
      if(['chapi', 'vcapi', 'interact'].includes(profile)) {
        continue;
      }
      if(!formats.some(f => cfg.dcapi.formats.includes(f))) {
        continue;
      }
      const hasMsoMdoc = formats.some(f => f === 'mso_mdoc');
      if(hasMsoMdoc || DC_API_AGGREGATOR_PROFILES.includes(profile) ||
        profile === 'OID4VP-HAIP-1.0') {
        result.push(walletId);
        break;
      }
    }
  }
  return result;
}

function _matchingWallets({
  enabledWalletIds, profile, methods, formats, exchange, registry
}) {
  const result = [];
  for(const walletId of enabledWalletIds) {
    const wallet = registry[walletId];
    if(!wallet?.supportedProfiles?.[profile]) {
      continue;
    }
    const cfg = wallet.supportedProfiles[profile];
    for(const m of methods) {
      if(!cfg[m]?.formats) {
        continue;
      }
      if(formats.some(f => cfg[m].formats.includes(f)) &&
        exchange?.protocols?.[profile]) {
        result.push(walletId);
        break;
      }
    }
  }
  return result;
}

function _sortEntries(entries) {
  entries.sort((a, b) => {
    const ai = INTERACTION_METHOD_PRIORITY.indexOf(a.method);
    const bi = INTERACTION_METHOD_PRIORITY.indexOf(b.method);
    const am = ai === -1 ? Infinity : ai;
    const bm = bi === -1 ? Infinity : bi;
    if(am !== bm) {
      return am - bm;
    }
    // null profile (aggregator) sorts before named profiles
    if(a.profile === null && b.profile !== null) {
      return -1;
    }
    if(a.profile !== null && b.profile === null) {
      return 1;
    }
    const api = PROFILE_PRIORITY.indexOf(a.profile);
    const bpi = PROFILE_PRIORITY.indexOf(b.profile);
    return (api === -1 ? Infinity : api) - (bpi === -1 ? Infinity : bpi);
  });
}
