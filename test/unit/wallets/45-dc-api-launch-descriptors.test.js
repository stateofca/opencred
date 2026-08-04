/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {computeExchangeOptions} from
  '../../../common/wallets/exchange-options.js';
import expect from 'expect.js';

const registry = {
  'cadmv-ios': {
    id: 'cadmv-ios',
    name: 'CA DMV Wallet on iOS',
    platform: ['ios'],
    supportedFormats: ['mso_mdoc'],
    supportedProfiles: {
      'cadmv-ios': {dcapi: {formats: ['mso_mdoc']}}
    }
  },
  'google-wallet': {
    id: 'google-wallet',
    name: 'Google Wallet',
    platform: ['android'],
    supportedFormats: ['mso_mdoc'],
    supportedProfiles: {
      // Declaration order matters: the more specific profile is preferred when
      // both are on offer.
      'google-wallet': {dcapi: {formats: ['mso_mdoc']}},
      '18013-7-Annex-D': {dcapi: {formats: ['mso_mdoc']}}
    }
  },
  'apple-wallet': {
    id: 'apple-wallet',
    name: 'Digital Wallet on Apple Device',
    platform: ['ios'],
    supportedFormats: ['mso_mdoc'],
    supportedProfiles: {
      'apple-wallet': {dcapi: {formats: ['mso_mdoc']}},
      '18013-7-Annex-C': {dcapi: {formats: ['mso_mdoc']}}
    }
  }
};

const workflowBase = {
  type: 'native',
  dcApiEnabled: true,
  query: [{
    format: ['mso_mdoc'],
    fields: {'org.iso.18013.5.1': ['given_name']}
  }]
};

const exchange = {
  protocols: {
    'apple-wallet': 'openid4vp://apple',
    'google-wallet': 'openid4vp://google',
    'cadmv-ios': 'openid4vp://cadmv-ios',
    '18013-7-Annex-C': 'openid4vp://annex-c',
    '18013-7-Annex-D': 'openid4vp://annex-d'
  }
};

function options({workflow = workflowBase, platform = {}} = {}) {
  return computeExchangeOptions({
    workflow,
    exchange,
    systemWallets: Object.keys(registry),
    userSettings: {enabledWallets: [], enabledProfiles: []},
    platform,
    dcApiSystemAvailable: true,
    registry
  });
}

function dcApiEntries(result) {
  return result.pickerEntries.filter(e => e.method === 'dcapi');
}

describe('DC API launch-option descriptors', () => {
  // Every DC API picker entry must carry descriptors, so that the renderer has
  // exactly one code path regardless of how the buttons were derived.
  it('attaches buttons to every dcapi picker entry', () => {
    const entries = dcApiEntries(options());
    expect(entries.length).to.be.greaterThan(0);
    for(const entry of entries) {
      expect(entry.buttons).to.be.an('array');
      expect(entry.buttons.length).to.be.greaterThan(0);
    }
  });

  describe('default: one button per enabled compatible wallet', () => {
    it('derives a wallet-branded button per wallet', () => {
      const [aggregator] = dcApiEntries(options());
      expect(aggregator.profile).to.be(null);

      const ids = aggregator.buttons.map(b => b.id);
      expect(ids).to.contain('apple-wallet');
      expect(ids).to.contain('google-wallet');
      expect(ids).to.contain('cadmv-ios');

      for(const button of aggregator.buttons) {
        expect(button.walletBranded).to.be(true);
        expect(button.profiles.length).to.be(1);
        // Wallet name available for the label without registry lookup.
        expect(button.label ?? button.labelKey).to.be.a('string');
      }
    });

    it('picks each wallet\'s first declared DC API profile that the ' +
      'exchange offers', () => {
      const [aggregator] = dcApiEntries(options());
      const google = aggregator.buttons.find(b => b.id === 'google-wallet');
      // Not 18013-7-Annex-D, which the wallet declares second.
      expect(google.profiles).to.eql(['google-wallet']);
    });

    it('skips a wallet whose profiles the exchange does not offer', () => {
      const result = computeExchangeOptions({
        workflow: workflowBase,
        exchange: {protocols: {'apple-wallet': 'openid4vp://apple'}},
        systemWallets: Object.keys(registry),
        userSettings: {enabledWallets: [], enabledProfiles: []},
        platform: {},
        dcApiSystemAvailable: true,
        registry
      });
      const [aggregator] = dcApiEntries(result);
      expect(aggregator.buttons.map(b => b.id)).to.eql(['apple-wallet']);
    });

    it('is unaffected by dcApiButtons being absent', () => {
      const result = options({workflow: {...workflowBase}});
      expect(dcApiEntries(result).length).to.be.greaterThan(0);
    });
  });

  describe('configured dcApiButtons', () => {
    const workflow = {
      ...workflowBase,
      dcApiButtons: [{
        id: 'mdl',
        labelKey: 'walletButton_presentMdl',
        profiles: ['apple-wallet', 'google-wallet']
      }]
    };

    it('emits a single dcapi entry carrying the configured buttons', () => {
      const entries = dcApiEntries(options({workflow}));
      expect(entries.length).to.be(1);
      expect(entries[0].buttons.length).to.be(1);
    });

    it('preserves configured profile order, which is the DC API request ' +
      'order', () => {
      const [entry] = dcApiEntries(options({workflow}));
      expect(entry.buttons[0].profiles)
        .to.eql(['apple-wallet', 'google-wallet']);
    });

    it('carries the configured label and is not wallet-branded', () => {
      const [entry] = dcApiEntries(options({workflow}));
      const [button] = entry.buttons;
      expect(button.id).to.be('mdl');
      expect(button.labelKey).to.be('walletButton_presentMdl');
      expect(button.walletBranded).to.be(false);
    });

    // A multi-wallet button is exactly the case where naming the wallets
    // matters, since the label cannot.
    it('lists every wallet that may handle any requested profile', () => {
      const [entry] = dcApiEntries(options({workflow}));
      const walletIds = entry.buttons[0].handledBy.map(h => h.walletId);
      expect(walletIds).to.contain('apple-wallet');
      expect(walletIds).to.contain('google-wallet');
      expect(walletIds).to.not.contain('cadmv-ios');
      for(const handled of entry.buttons[0].handledBy) {
        expect(handled.name ?? handled.nameKey).to.be.a('string');
      }
    });

    it('replaces the derived per-wallet buttons', () => {
      const derived = dcApiEntries(options())[0].buttons;
      const configured = dcApiEntries(options({workflow}))[0].buttons;
      // Derived gives one wallet-branded button per wallet; configured gives
      // exactly the one button asked for.
      expect(derived.length).to.be.greaterThan(1);
      expect(derived.every(b => b.walletBranded)).to.be(true);
      expect(configured.length).to.be(1);
      expect(configured[0].walletBranded).to.be(false);
    });

    // A user-enabled DC-API-only profile adds a second derived dcapi entry.
    // Configured buttons must replace that too, or the workflow gets a button
    // it did not ask for alongside the one it did.
    it('replaces derived per-profile entries as well as the aggregator', () => {
      const iosSettings = {
        platform: {isIOS: true},
        userSettings: {
          enabledWallets: [], enabledProfiles: ['18013-7-Annex-C']
        }
      };
      const derived = dcApiEntries(computeExchangeOptions({
        workflow: workflowBase,
        exchange,
        systemWallets: Object.keys(registry),
        dcApiSystemAvailable: true,
        registry,
        ...iosSettings
      }));
      expect(derived.map(e => e.profile))
        .to.eql([null, '18013-7-Annex-C']);

      const configured = dcApiEntries(computeExchangeOptions({
        workflow,
        exchange,
        systemWallets: Object.keys(registry),
        dcApiSystemAvailable: true,
        registry,
        ...iosSettings
      }));
      expect(configured.length).to.be(1);
      expect(configured[0].buttons.map(b => b.id)).to.eql(['mdl']);
    });

    it('leaves non-DC-API picker entries alone', () => {
      const result = options({workflow});
      const others = result.pickerEntries.filter(e => e.method !== 'dcapi');
      const derivedOthers = options().pickerEntries
        .filter(e => e.method !== 'dcapi');
      expect(others.length).to.be(derivedOthers.length);
    });

    // getProtocols() only publishes google-wallet / apple-wallet when the
    // matching walletCertificates entry exists, so a button can lose profiles
    // in a given deployment.
    it('filters profiles the exchange does not offer', () => {
      const result = computeExchangeOptions({
        workflow,
        exchange: {protocols: {'apple-wallet': 'openid4vp://apple'}},
        systemWallets: Object.keys(registry),
        userSettings: {enabledWallets: [], enabledProfiles: []},
        platform: {},
        dcApiSystemAvailable: true,
        registry
      });
      const [entry] = dcApiEntries(result);
      expect(entry.buttons[0].profiles).to.eql(['apple-wallet']);
    });

    it('drops a button left with no offered profiles', () => {
      const result = computeExchangeOptions({
        workflow,
        exchange: {protocols: {'cadmv-ios': 'openid4vp://cadmv-ios'}},
        systemWallets: Object.keys(registry),
        userSettings: {enabledWallets: [], enabledProfiles: []},
        platform: {},
        dcApiSystemAvailable: true,
        registry
      });
      expect(dcApiEntries(result).length).to.be(0);
    });

    it('is inert when the DC API is unavailable', () => {
      const result = computeExchangeOptions({
        workflow,
        exchange,
        systemWallets: Object.keys(registry),
        userSettings: {enabledWallets: [], enabledProfiles: []},
        platform: {},
        dcApiSystemAvailable: false,
        registry
      });
      expect(dcApiEntries(result).length).to.be(0);
    });
  });
});
