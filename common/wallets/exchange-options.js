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
 * The interaction methods a profile can be reached by, independent of any
 * exchange or device — the static half of `_profileCompat`'s method derivation
 * with the runtime gates (`dcApiSystemAvailable`, platform) removed.
 *
 * "Static" means "could offer": `dcapi` is listed for OID4VP profiles even
 * though whether it actually renders depends on the browser having a DC API.
 * This is what config-load validation checks a declared connection option's
 * method against — a method a profile can never offer is a static
 * impossibility, while a method it offers only on some devices is derivation's
 * concern.
 *
 * @param {string} profile - A picker-entry profile from `PROFILES_LIST`.
 * @returns {Array<string>} UI-facing interaction methods, `[]` for an
 *   unrecognized profile.
 */
export function staticInteractionMethodsForProfile(profile) {
  if(DC_API_ONLY_PROFILES.includes(profile)) {
    return ['dcapi'];
  }
  if(OID4VP_PROFILES.includes(profile)) {
    return ['qr-and-link', 'dcapi'];
  }
  if(profile === 'interact') {
    return ['qr-and-copy'];
  }
  if(profile === 'vcapi') {
    return ['qr-and-link'];
  }
  if(profile === 'chapi') {
    return ['chapi'];
  }
  return [];
}

/**
 * Compute the unified set of options for the current exchange.
 *
 * @param {object} input - Input parameters.
 * @param {object} input.workflow - Workflow configuration
 *   (used for `query`/`dcql_query` to derive formats, and for
 *   `dcApiButtons` to build DC API launch options).
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
 *   `{isIOS, isAndroid, isMobile, isSamsungBrowser}`. When
 *   `isSamsungBrowser` is true, the DC API is treated as unavailable
 *   and interaction falls back to QR/link options.
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
 * }} The computed exchange options. Each `dcapi` picker entry carries a
 *   `buttons` array of launch-option descriptors; see `_handledBy`.
 */
export function computeExchangeOptions(input) {
  const {
    workflow,
    exchange,
    systemWallets = [],
    oid4vpDefaultProfile,
    userSettings = {},
    platform = {},
    registry = WALLETS_REGISTRY
  } = input;
  // Samsung Internet's DC API support is not interoperable; treat the
  // DC API as unavailable there so interaction falls back to the
  // configured OID4VP default over QR/link.
  const dcApiSystemAvailable = platform.isSamsungBrowser === true ?
    false : (input.dcApiSystemAvailable ?? false);

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
      ...(wallet.productName && {productName: wallet.productName}),
      ...(wallet.productNameKey && {productNameKey: wallet.productNameKey}),
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
  const derivedEntries = _buildPickerEntries({
    enabledWalletIds, enabledProfileIds, availableProfiles,
    formats, exchange, dcApiOk, registry,
    dcApiButtons: workflow?.dcApiButtons
  });

  // A workflow's `connectionOptions` declaration selects and orders the derived
  // entries; with none, derivation's own set and order stand unchanged.
  const pickerEntries = _selectAndOrderPickerEntries({
    entries: derivedEntries,
    connectionOptions: workflow?.connectionOptions
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

// ---------------------------------------------------------------------------
// DC API launch-option descriptors
// ---------------------------------------------------------------------------

/*
 * A launch-option descriptor is the single unit of DC API interaction: one
 * button, and every profile it requests together in one
 * `navigator.credentials.get()` call.
 *
 * Descriptors are deliberately self-describing for rendering — they carry
 * resolved label and "handled by" inputs rather than wallet ids to look up — so
 * that no component re-derives anything from the wallet registry. That is what
 * lets `DcApiInteraction.vue` be a single `v-for` instead of the two divergent
 * derivation paths it had.
 *
 *   {
 *     id,               // stable v-for key and telemetry handle
 *     profiles: [...],  // ORDER SIGNIFICANT - the DC API `requests` order
 *     labelKey, label,  // label inputs; see precedence below
 *     desktopLabelKey?, // optional desktop-only i18n label key (QR flow)
 *     walletBranded,    // true when the label names one specific wallet
 *     handledBy: [{walletId, nameKey?, name?}]
 *   }
 *
 * Label precedence, mirroring `successViewFields`: `labelKey` when it resolves
 * in the current locale, else literal `label`, else a generic fallback. The
 * component does the i18n; this module only supplies the inputs.
 *
 * `handledBy` drives the "may be handled by ..." hint, shown for descriptors
 * that are not wallet-branded — which covers both the pre-existing
 * single-profile button and a configured multi-wallet button, where naming the
 * wallets is exactly what a user needs.
 */

/**
 * Build the `handledBy` entries for a set of wallets.
 *
 * @param {object} options - Options.
 * @param {Array<string>} options.walletIds - Wallets to describe.
 * @param {object} options.registry - Wallet registry.
 * @returns {Array<object>} `handledBy` entries.
 */
function _handledBy({walletIds, registry}) {
  return (walletIds ?? [])
    .filter(walletId => registry[walletId])
    .map(walletId => {
      const wallet = registry[walletId];
      return {
        walletId,
        ...(wallet.nameKey && {nameKey: wallet.nameKey}),
        ...(wallet.name && {name: wallet.name})
      };
    });
}

/**
 * The first DC-API-capable profile a wallet declares that this exchange
 * actually offers.
 *
 * Registry declaration order is meaningful: `google-wallet` lists its own
 * `google-wallet` profile before `18013-7-Annex-D`, so the more specific
 * profile wins when both are available.
 *
 * @param {object} options - Options.
 * @param {object} options.wallet - Registry entry.
 * @param {Array<string>} options.availableProfiles - `exchange.protocols` keys.
 * @returns {string|null} Profile id, or null when the wallet has none here.
 */
function _firstDcApiProfile({wallet, availableProfiles}) {
  for(const [profile, profileConfig] of
    Object.entries(wallet?.supportedProfiles ?? {})) {
    if(!profileConfig?.dcapi) {
      continue;
    }
    if(availableProfiles.includes(profile)) {
      return profile;
    }
  }
  return null;
}

/**
 * Descriptors for the default, unconfigured case: one button per enabled
 * compatible wallet, labeled with that wallet's own name.
 *
 * This is what keeps `workflow.dcApiButtons` optional: an unconfigured
 * workflow renders exactly what it rendered before multi-profile support
 * existed.
 *
 * @param {object} options - Options.
 * @param {Array<string>} options.walletIds - The aggregator entry's wallets.
 * @param {Array<string>} options.availableProfiles - `exchange.protocols` keys.
 * @param {object} options.registry - Wallet registry.
 * @returns {Array<object>} One descriptor per wallet.
 */
function _perWalletDescriptors({walletIds, availableProfiles, registry}) {
  const descriptors = [];
  for(const walletId of walletIds) {
    const wallet = registry[walletId];
    if(!wallet) {
      continue;
    }
    const profile = _firstDcApiProfile({wallet, availableProfiles});
    if(!profile) {
      continue;
    }
    descriptors.push({
      id: walletId,
      profiles: [profile],
      ...(wallet.nameKey && {labelKey: wallet.nameKey}),
      ...(wallet.name && {label: wallet.name}),
      walletBranded: true,
      handledBy: _handledBy({walletIds: [walletId], registry})
    });
  }
  return descriptors;
}

/**
 * The descriptor for a per-profile DC API entry: one button requesting that one
 * profile, generically labeled, with the hint naming the wallets that may
 * handle it. Reproduces the pre-existing single-profile button.
 *
 * @param {object} options - Options.
 * @param {string} options.profile - The profile this entry is for.
 * @param {Array<string>} options.walletIds - Wallets that may handle it.
 * @param {object} options.registry - Wallet registry.
 * @returns {object} The descriptor.
 */
function _singleProfileDescriptor({profile, walletIds, registry}) {
  return {
    id: profile,
    profiles: [profile],
    labelKey: 'dcApiSingleProfile_buttonLabel',
    walletBranded: false,
    handledBy: _handledBy({walletIds, registry})
  };
}

/**
 * Descriptors from `workflow.dcApiButtons`.
 *
 * Each button's profiles are filtered to those the exchange actually offers,
 * and a button left with none is dropped: `getProtocols()` only publishes
 * `google-wallet` / `apple-wallet` when the matching `walletCertificates` entry
 * exists, so a button can legitimately lose profiles in a given deployment.
 *
 * @param {object} options - Options.
 * @param {Array<object>} options.dcApiButtons - Configured buttons.
 * @param {Array<string>} options.availableProfiles - `exchange.protocols` keys.
 * @param {object} options.registry - Wallet registry.
 * @returns {Array<object>} Descriptors, in configured order.
 */
function _configuredDescriptors({dcApiButtons, availableProfiles, registry}) {
  const descriptors = [];
  for(const button of dcApiButtons) {
    const profiles = (button.profiles ?? [])
      .filter(profile => availableProfiles.includes(profile));
    if(profiles.length === 0) {
      continue;
    }
    // Every wallet that declares a DC API method for any requested profile,
    // deduplicated and in registry order.
    const walletIds = Object.keys(registry).filter(walletId =>
      profiles.some(
        profile => registry[walletId]?.supportedProfiles?.[profile]?.dcapi));
    descriptors.push({
      id: button.id,
      profiles,
      ...(button.labelKey && {labelKey: button.labelKey}),
      ...(button.desktopLabelKey && {desktopLabelKey: button.desktopLabelKey}),
      ...(button.label && {label: button.label}),
      walletBranded: false,
      handledBy: _handledBy({walletIds, registry})
    });
  }
  return descriptors;
}

function _buildPickerEntries({
  enabledWalletIds, enabledProfileIds, availableProfiles,
  formats, exchange, dcApiOk, registry, dcApiButtons
}) {
  const entries = [];

  // Configured DC API buttons REPLACE the derived entries below, so a workflow
  // that configures them gets exactly the buttons it asked for. One entry
  // carrying every descriptor, rather than one entry per button, because the
  // picker offers a choice of *connection method* and these are all the same
  // method.
  const configured = Array.isArray(dcApiButtons) && dcApiButtons.length > 0 ?
    _configuredDescriptors({dcApiButtons, availableProfiles, registry}) : null;
  if(dcApiOk && configured && configured.length > 0) {
    entries.push({
      method: 'dcapi',
      profile: null,
      walletIds: [...new Set(
        configured.flatMap(d => d.handledBy.map(h => h.walletId)))],
      buttons: configured
    });
  }

  // Configured buttons replace every derived DC API entry — the aggregator
  // below and the per-profile ones further down — so a workflow gets exactly
  // the DC API buttons it asked for. Non-DC-API entries are untouched.
  const derivedDcApiOk = dcApiOk && !configured;

  // DC API all-wallets aggregator
  if(derivedDcApiOk) {
    const wallets = _dcApiAggregatorWallets({
      enabledWalletIds, availableProfiles, formats, registry
    });
    if(wallets.length > 0) {
      entries.push({
        method: 'dcapi',
        profile: null,
        walletIds: wallets,
        buttons: _perWalletDescriptors({
          walletIds: wallets, availableProfiles, registry
        })
      });
    }
  }

  // Per-enabled-profile entries.
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
      if(derivedDcApiOk) {
        const dcApiWallets = _matchingWallets({
          enabledWalletIds, profile, methods: ['dcapi'],
          formats, exchange, registry
        });
        if(dcApiWallets.length > 0) {
          entries.push({
            method: 'dcapi', profile, walletIds: dcApiWallets,
            buttons: [_singleProfileDescriptor({
              profile, walletIds: dcApiWallets, registry
            })]
          });
        }
      }
    } else if(DC_API_ONLY_PROFILES.includes(profile) && derivedDcApiOk) {
      const dcApiWallets = _matchingWallets({
        enabledWalletIds, profile, methods: ['dcapi'],
        formats, exchange, registry
      });
      if(dcApiWallets.length > 0) {
        entries.push({
          method: 'dcapi', profile, walletIds: dcApiWallets,
          buttons: [_singleProfileDescriptor({
            profile, walletIds: dcApiWallets, registry
          })]
        });
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

/**
 * Select and order the derived picker entries by a workflow's
 * `connectionOptions` declaration.
 *
 * The declaration filters and orders; it never adds. Each declared entry is
 * matched to the one derived entry keyed on the same `(method, profile)` pair
 * — a `dcapi` entry with no `profile` selects the DC API aggregator, whose
 * derived entry carries `profile: null`. A declared entry with no matching
 * derived entry is non-viable on this device or exchange (or names an option
 * nothing produced) and is simply skipped, so the next declared entry is
 * promoted; there is no new "can't use this" state. A derived entry the
 * declaration did not name is dropped. The result is the declared, ordered,
 * filtered list that every consumer walks: the default active entry, the
 * picker, and the "try another way" fallback.
 *
 * A matched entry carries any presentation overrides the declaration set —
 * `label`/`labelKey` for the option itself and `destinationLabel`/
 * `destinationLabelKey` for naming it as a switch-link destination — leaving
 * everything derivation computed (wallets, launch descriptors) untouched.
 *
 * With no declaration, derivation's own set and order stand unchanged, so an
 * unconfigured workflow behaves exactly as before.
 *
 * @param {object} options - Options.
 * @param {Array<object>} options.entries - The derived, sorted picker entries.
 * @param {Array<object>} [options.connectionOptions] - The workflow's declared
 *   connection options, in order.
 * @returns {Array<object>} The selected, ordered entries.
 */
function _selectAndOrderPickerEntries({entries, connectionOptions}) {
  if(!Array.isArray(connectionOptions) || connectionOptions.length === 0) {
    return entries;
  }
  const selected = [];
  for(const option of connectionOptions) {
    // A declared `dcapi` entry with no profile selects the aggregator, whose
    // derived entry's profile is null; every other declared entry names one.
    const wantProfile = option.profile ?? null;
    const match = entries.find(
      e => e.method === option.method && e.profile === wantProfile);
    if(!match) {
      continue;
    }
    selected.push({
      ...match,
      ...(option.label !== undefined && {label: option.label}),
      ...(option.labelKey !== undefined && {labelKey: option.labelKey}),
      ...(option.destinationLabel !== undefined &&
        {destinationLabel: option.destinationLabel}),
      ...(option.destinationLabelKey !== undefined &&
        {destinationLabelKey: option.destinationLabelKey})
    });
  }
  return selected;
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
