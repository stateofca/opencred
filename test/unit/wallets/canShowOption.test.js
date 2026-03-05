/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  canShowOption,
  getAvailableWalletIds,
  loadUserSettings,
  saveUserSettings
} from '../../../common/wallets/canShowOption.js';
import expect from 'expect.js';

describe('canShowOption', () => {
  const baseOptions = {
    workflow: {query: [{format: ['ldp_vc']}]},
    availableProtocols: ['OID4VP-draft18', 'interact'],
    exchange: {
      protocols: {
        'OID4VP-draft18': 'openid4vp://test',
        interact: 'https://example.com/interact'
      }
    },
    platform: {isIOS: false, isAndroid: false, isMobile: false},
    userSettings: {
      enabledWallets: ['cadmv-wallet', 'lcw', 'interaction'],
      enabledProtocols: []
    },
    dcApiSystemAvailable: false
  };

  describe('walletId', () => {
    it('should return available for enabled wallet with format and protocol ' +
      'match', () => {
      const result = canShowOption({
        ...baseOptions,
        walletId: 'cadmv-wallet'
      });
      expect(result).to.eql({available: true});
    });

    it('should return not available when wallet not in enabledWallets', () => {
      const result = canShowOption({
        ...baseOptions,
        userSettings: {...baseOptions.userSettings, enabledWallets: ['lcw']},
        walletId: 'cadmv-wallet'
      });
      expect(result).to.eql({available: false});
    });

    it('should return not available when no format overlap', () => {
      const result = canShowOption({
        ...baseOptions,
        workflow: {query: [{format: ['mso_mdoc']}]},
        walletId: 'lcw'
      });
      expect(result).to.eql({available: false});
    });

    it('should return not available when protocol not in exchange', () => {
      const result = canShowOption({
        ...baseOptions,
        availableProtocols: [],
        walletId: 'cadmv-wallet'
      });
      expect(result).to.eql({available: false});
    });
  });

  describe('protocolId', () => {
    it('should return available for enabled protocol with format match', () => {
      const result = canShowOption({
        ...baseOptions,
        userSettings: {
          ...baseOptions.userSettings,
          enabledProtocols: ['interact']
        },
        protocolId: 'interact'
      });
      expect(result).to.eql({available: true});
    });

    it('should return not available when protocol not enabled', () => {
      const result = canShowOption({
        ...baseOptions,
        protocolId: 'interact'
      });
      expect(result).to.eql({available: false});
    });

    it('should return not available when protocol not in availableProtocols' +
      'list', () => {
      const result = canShowOption({
        ...baseOptions,
        userSettings: {
          ...baseOptions.userSettings,
          enabledProtocols: ['interact']
        },
        availableProtocols: ['OID4VP-draft18'],
        protocolId: 'interact'
      });
      expect(result).to.eql({available: false});
    });
  });

  describe('empty workflow', () => {
    it('should return not available when no formats', () => {
      const result = canShowOption({
        ...baseOptions,
        workflow: {},
        walletId: 'cadmv-wallet'
      });
      expect(result).to.eql({available: false});
    });
  });
});

describe('loadUserSettings / saveUserSettings', () => {
  const key = 'opencred-app-settings';

  beforeEach(() => {
    if(typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.removeItem(key);
    }
  });

  it('should return default when nothing stored', () => {
    if(typeof globalThis.localStorage === 'undefined') {
      const result = loadUserSettings();
      expect(result).to.have.property('enabledWallets');
      expect(result).to.have.property('enabledProtocols');
      expect(result.enabledWallets).to.be.an('array');
      expect(result.enabledProtocols).to.be.an('array');
      return;
    }
    globalThis.localStorage.removeItem(key);
    const result = loadUserSettings();
    expect(result).to.have.property('enabledWallets');
    expect(result).to.have.property('enabledProtocols');
    expect(result.enabledWallets).to.be.an('array');
    expect(result.enabledProtocols).to.be.an('array');
  });

  it('should round-trip settings when localStorage available', () => {
    if(typeof globalThis.localStorage === 'undefined') {
      return;
    }
    const settings = {
      enabledWallets: ['cadmv-wallet'],
      enabledProtocols: ['interact']
    };
    saveUserSettings(settings);
    const loaded = loadUserSettings();
    expect(loaded.enabledWallets).to.eql(settings.enabledWallets);
    expect(loaded.enabledProtocols).to.eql(settings.enabledProtocols);
  });
});

describe('getAvailableWalletIds', () => {
  it('should return wallet IDs that can be shown', () => {
    const result = getAvailableWalletIds({
      ...{
        workflow: {query: [{format: ['ldp_vc']}]},
        availableProtocols: ['OID4VP-draft18'],
        exchange: {protocols: {'OID4VP-draft18': 'test'}},
        platform: {},
        userSettings: {
          enabledWallets: ['cadmv-wallet', 'lcw'],
          enabledProtocols: []
        },
        dcApiSystemAvailable: false
      }
    });
    expect(result).to.be.an('array');
    expect(result).to.contain('cadmv-wallet');
  });
});
