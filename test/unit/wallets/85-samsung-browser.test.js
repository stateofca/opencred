/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {computeExchangeOptions} from
  '../../../common/wallets/exchange-options.js';
import expect from 'expect.js';

const miniRegistry = {
  'cadmv-android': {
    id: 'cadmv-android',
    groupId: 'cadmv-wallet',
    name: 'CA DMV Wallet (Android)',
    platform: ['android'],
    supportedFormats: ['mso_mdoc', 'jwt_vc_json', 'ldp_vc'],
    supportedProfiles: {
      'cadmv-android': {
        dcapi: {formats: ['mso_mdoc']}
      },
      'OID4VP-draft18': {
        qr: {formats: ['jwt_vc_json', 'ldp_vc']},
        link: {formats: ['jwt_vc_json', 'ldp_vc']}
      },
      'OID4VP-1.0': {
        qr: {formats: ['jwt_vc_json', 'ldp_vc']},
        link: {formats: ['jwt_vc_json', 'ldp_vc']}
      }
    }
  },
  'google-wallet': {
    id: 'google-wallet',
    name: 'Google Wallet',
    platform: ['android'],
    supportedFormats: ['mso_mdoc'],
    supportedProfiles: {
      'google-wallet': {
        dcapi: {formats: ['mso_mdoc']}
      },
      '18013-7-Annex-D': {
        dcapi: {formats: ['mso_mdoc']}
      }
    }
  }
};

const baseInput = {
  workflow: {query: [{format: ['mso_mdoc', 'jwt_vc_json', 'ldp_vc']}]},
  exchange: {
    protocols: {
      'OID4VP-draft18': 'openid4vp://test',
      'OID4VP-1.0': 'openid4vp://test',
      'cadmv-android': 'openid4vp://test',
      'google-wallet': 'openid4vp://test',
      '18013-7-Annex-D': 'openid4vp://test'
    }
  },
  systemWallets: ['cadmv-android', 'google-wallet'],
  oid4vpDefaultProfile: 'OID4VP-1.0',
  userSettings: {enabledWallets: [], enabledProfiles: []},
  platform: {isIOS: false, isAndroid: true, isMobile: true},
  dcApiSystemAvailable: true,
  registry: miniRegistry
};

describe('computeExchangeOptions on Samsung Internet', () => {
  const samsungInput = {
    ...baseInput,
    platform: {...baseInput.platform, isSamsungBrowser: true}
  };

  it('should exclude all dcapi picker entries', () => {
    const result = computeExchangeOptions(samsungInput);
    const methods = result.pickerEntries.map(e => e.method);
    expect(methods).to.not.contain('dcapi');
  });

  it('should only offer the CA DMV wallet over OID4VP-draft18', () => {
    const result = computeExchangeOptions(samsungInput);
    expect(result.pickerEntries.length).to.be(1);
    const [entry] = result.pickerEntries;
    expect(entry.method).to.be('qr-and-link');
    expect(entry.profile).to.be('OID4VP-draft18');
    expect(entry.walletIds).to.eql(['cadmv-android']);
  });

  it('should restrict wallet lists to the CA DMV wallet', () => {
    const result = computeExchangeOptions(samsungInput);
    const allWalletIds = [
      ...result.defaultWallets, ...result.extraWallets
    ].map(w => w.walletId);
    expect(allWalletIds).to.eql(['cadmv-android']);
  });

  it('should restrict profile lists to OID4VP-draft18', () => {
    const result = computeExchangeOptions(samsungInput);
    const allProfiles = [
      ...result.defaultProfiles, ...result.extraProfiles
    ].map(p => p.profile);
    expect(allProfiles).to.eql(['OID4VP-draft18']);
  });

  it('should not restrict options when not Samsung Internet', () => {
    const result = computeExchangeOptions(baseInput);
    const methods = result.pickerEntries.map(e => e.method);
    expect(methods).to.contain('dcapi');
    const walletIds = result.defaultWallets.map(w => w.walletId);
    expect(walletIds).to.contain('google-wallet');
  });
});
