/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {computeExchangeOptions} from
  '../../../common/wallets/exchange-options.js';
import expect from 'expect.js';

const miniRegistry = {
  'cadmv-android': {
    id: 'cadmv-android',
    name: 'CA DMV Wallet (Android)',
    icon: '/wallets/cadmv-wallet-icon.png',
    platform: ['android'],
    supportedFormats: ['mso_mdoc'],
    supportedProfiles: {
      'cadmv-android': {
        dcapi: {formats: ['mso_mdoc']}
      }
    }
  },
  'cadmv-ios': {
    id: 'cadmv-ios',
    name: 'CA DMV Wallet (iOS)',
    icon: '/wallets/cadmv-wallet-icon.png',
    platform: ['ios'],
    supportedFormats: ['mso_mdoc'],
    supportedProfiles: {
      'cadmv-ios': {
        dcapi: {formats: ['mso_mdoc']}
      }
    }
  },
  lcw: {
    id: 'lcw',
    name: 'Learner Credential Wallet',
    platform: ['ios', 'android'],
    supportedFormats: ['ldp_vc'],
    supportedProfiles: {
      vcapi: {
        qr: {formats: ['ldp_vc']},
        link: {formats: ['ldp_vc']},
        copy: {formats: ['ldp_vc']}
      },
      chapi: {
        chapi: {formats: ['ldp_vc']}
      }
    }
  },
  'google-wallet': {
    id: 'google-wallet',
    name: 'Google Wallet',
    icon: '/wallets/google-wallet-icon.png',
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
  },
  'apple-wallet': {
    id: 'apple-wallet',
    name: 'Apple Wallet',
    icon: '/wallets/apple-wallet-icon.png',
    platform: ['ios'],
    supportedFormats: ['mso_mdoc'],
    supportedProfiles: {
      '18013-7-Annex-C': {
        dcapi: {formats: ['mso_mdoc']}
      }
    }
  }
};

const baseInput = {
  workflow: {query: [{format: ['ldp_vc']}]},
  exchange: {
    protocols: {
      'OID4VP-draft18': 'openid4vp://test',
      interact: 'https://example.com/interact',
      vcapi: 'https://example.com/vcapi',
      chapi: 'https://example.com/chapi'
    }
  },
  systemWallets: ['cadmv-android', 'cadmv-ios', 'lcw'],
  oid4vpDefaultProfile: 'OID4VP-draft18',
  userSettings: {enabledWallets: [], enabledProfiles: []},
  platform: {isIOS: false, isAndroid: false, isMobile: false},
  dcApiSystemAvailable: false,
  registry: miniRegistry
};

describe('computeExchangeOptions', () => {
  describe('defaults vs extras split', () => {
    it('should place systemWallets in defaultWallets', () => {
      const result = computeExchangeOptions(baseInput);
      const defaultIds = result.defaultWallets.map(w => w.walletId);
      expect(defaultIds).to.contain('lcw');
    });

    it('should place non-system wallets in extraWallets', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        systemWallets: ['lcw']
      });
      const extraIds = result.extraWallets.map(w => w.walletId);
      expect(extraIds).to.not.contain('lcw');
    });

    it('should not contribute disabled extras to pickerEntries', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        systemWallets: [],
        userSettings: {enabledWallets: [], enabledProfiles: []}
      });
      const dcapi = result.pickerEntries.find(e => e.method === 'dcapi');
      expect(dcapi).to.be(undefined);
    });

    it('should contribute enabled extras to pickerEntries', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {query: [{format: ['mso_mdoc']}]},
        exchange: {
          protocols: {'cadmv-android': 'https://example.com/cadmv-android'}
        },
        systemWallets: [],
        userSettings: {
          enabledWallets: ['cadmv-android'],
          enabledProfiles: []
        },
        dcApiSystemAvailable: true
      });
      const dcapi = result.pickerEntries.find(
        e => e.method === 'dcapi' && e.profile === null);
      expect(dcapi).to.be.an('object');
      expect(dcapi.walletIds).to.contain('cadmv-android');
    });
  });

  describe('compatibility filters', () => {
    it('should hide wallets with no format overlap', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {query: [{format: ['mso_mdoc']}]}
      });
      const defaultIds = result.defaultWallets.map(w => w.walletId);
      expect(defaultIds).to.not.contain('lcw');
    });

    it('should hide iOS-only wallets on Android', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {query: [{format: ['mso_mdoc']}]},
        exchange: {
          protocols: {
            'cadmv-android': 'https://x',
            'cadmv-ios': 'https://x',
            '18013-7-Annex-C': 'https://x',
            '18013-7-Annex-D': 'https://x'
          }
        },
        platform: {isIOS: false, isAndroid: true, isMobile: true},
        dcApiSystemAvailable: true
      });
      const defaultIds = result.defaultWallets.map(w => w.walletId);
      expect(defaultIds).to.contain('cadmv-android');
      expect(defaultIds).to.not.contain('cadmv-ios');
      expect(defaultIds).to.not.contain('apple-wallet');
    });

    it('should hide profile not in availableProfiles', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {protocols: {interact: 'https://example.com/interact'}}
      });
      expect(result.defaultProfiles.map(p => p.profile))
        .to.not.contain('OID4VP-draft18');
    });

    it('should not emit dcapi entries when dcApiSystemAvailable is false',
      () => {
        const result = computeExchangeOptions({
          ...baseInput,
          dcApiSystemAvailable: false
        });
        const dcapi = result.pickerEntries.filter(
          e => e.method === 'dcapi');
        expect(dcapi.length).to.be(0);
      });
  });

  describe('aggregator vs per-profile DC API', () => {
    it('should emit (dcapi, null) aggregator from default wallets', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {query: [{format: ['mso_mdoc']}]},
        exchange: {
          protocols: {'cadmv-android': 'https://example.com/cadmv-android'}
        },
        systemWallets: ['cadmv-android'],
        dcApiSystemAvailable: true
      });
      const agg = result.pickerEntries.find(
        e => e.method === 'dcapi' && e.profile === null);
      expect(agg).to.be.an('object');
      expect(agg.walletIds).to.contain('cadmv-android');
    });

    it('should NOT emit per-profile dcapi entry when no wallet supports ' +
      'the workflow format over DC API for that profile', () => {
      // baseInput's workflow is ldp_vc; no wallet in miniRegistry exposes
      // OID4VP-1.0 dcapi for ldp_vc, so the per-profile dcapi entry must
      // be omitted.
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {
          protocols: {
            'OID4VP-draft18': 'openid4vp://test',
            'OID4VP-1.0': 'openid4vp://test2',
            interact: 'https://example.com/interact'
          }
        },
        userSettings: {
          enabledWallets: [],
          enabledProfiles: ['OID4VP-1.0']
        },
        dcApiSystemAvailable: true
      });
      const perProfile = result.pickerEntries.find(
        e => e.method === 'dcapi' && e.profile === 'OID4VP-1.0');
      expect(perProfile).to.be(undefined);
    });

    it('should produce single-profile dcapi entry with walletIds', () => {
      const oid4vpRegistry = {
        'test-wallet': {
          id: 'test-wallet',
          name: 'Test Wallet',
          platform: ['ios', 'android'],
          supportedFormats: ['ldp_vc'],
          supportedProfiles: {
            'OID4VP-1.0': {
              dcapi: {formats: ['ldp_vc']},
              qr: {formats: ['ldp_vc']},
              link: {formats: ['ldp_vc']}
            }
          }
        }
      };
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {
          protocols: {
            'OID4VP-draft18': 'openid4vp://test',
            'OID4VP-1.0': 'openid4vp://test2'
          }
        },
        systemWallets: [],
        userSettings: {
          enabledWallets: ['test-wallet'],
          enabledProfiles: ['OID4VP-1.0']
        },
        dcApiSystemAvailable: true,
        registry: oid4vpRegistry
      });
      const entry = result.pickerEntries.find(
        e => e.method === 'dcapi' && e.profile === 'OID4VP-1.0');
      expect(entry).to.be.an('object');
      expect(entry.walletIds).to.contain('test-wallet');
    });

    it('should NOT emit a single-profile dcapi entry when no wallets match',
      () => {
        const result = computeExchangeOptions({
          ...baseInput,
          exchange: {
            protocols: {
              'OID4VP-draft18': 'openid4vp://test',
              'OID4VP-1.0': 'openid4vp://test2'
            }
          },
          systemWallets: [],
          userSettings: {
            enabledWallets: [],
            enabledProfiles: ['OID4VP-1.0']
          },
          dcApiSystemAvailable: true
        });
        const entry = result.pickerEntries.find(
          e => e.method === 'dcapi' && e.profile === 'OID4VP-1.0');
        expect(entry).to.be(undefined);
      });

    it('should NOT emit any dcapi entry for a jwt_vc_json-only workflow ' +
      'even when DC API is available (no wallet supports jwt_vc_json over ' +
      'DC API)', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {query: [{format: ['jwt_vc_json']}]},
        exchange: {
          protocols: {
            'OID4VP-1.0': 'openid4vp://test',
            interact: 'https://example.com/interact'
          }
        },
        systemWallets: ['cadmv-ios'],
        oid4vpDefaultProfile: 'OID4VP-1.0',
        userSettings: {
          enabledWallets: [],
          enabledProfiles: ['OID4VP-1.0']
        },
        platform: {isIOS: true, isAndroid: false, isMobile: true},
        dcApiSystemAvailable: true
      });
      const dcapiEntries = result.pickerEntries.filter(
        e => e.method === 'dcapi');
      expect(dcapiEntries).to.eql([]);
    });

    it('should emit qr-and-link for enabled OID4VP extra', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {
          protocols: {
            'OID4VP-draft18': 'openid4vp://test',
            'OID4VP-1.0': 'openid4vp://test2',
            interact: 'https://example.com/interact'
          }
        },
        userSettings: {
          enabledWallets: [],
          enabledProfiles: ['OID4VP-1.0']
        }
      });
      const qrLink = result.pickerEntries.filter(
        e => e.method === 'qr-and-link' && e.profile !== 'vcapi');
      expect(qrLink.length).to.be(2);
      expect(qrLink.map(e => e.profile)).to.contain('OID4VP-draft18');
      expect(qrLink.map(e => e.profile)).to.contain('OID4VP-1.0');
    });
  });

  describe('interact profile', () => {
    it('should emit qr-and-copy when interact is available and ' +
      'interactEnabled is default (true)', () => {
      const result = computeExchangeOptions(baseInput);
      const interact = result.pickerEntries.find(
        e => e.method === 'qr-and-copy' && e.profile === 'interact');
      expect(interact).to.be.an('object');
    });

    it('should include interact in defaultProfiles when interactEnabled ' +
      'is default', () => {
      const result = computeExchangeOptions(baseInput);
      expect(result.defaultProfiles.map(p => p.profile))
        .to.contain('interact');
    });

    it('should not emit interact when not in exchange protocols', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {protocols: {'OID4VP-draft18': 'openid4vp://test'}}
      });
      const interact = result.pickerEntries.find(
        e => e.profile === 'interact');
      expect(interact).to.be(undefined);
    });

    it('should move interact to extraProfiles when ' +
      'interactEnabled is false', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {
          ...baseInput.workflow,
          interactEnabled: false
        }
      });
      expect(result.defaultProfiles.map(p => p.profile))
        .to.not.contain('interact');
      const extra = result.extraProfiles.find(
        p => p.profile === 'interact');
      expect(extra).to.be.an('object');
    });

    it('should not emit interact picker entry by default when ' +
      'interactEnabled is false', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {
          ...baseInput.workflow,
          interactEnabled: false
        }
      });
      const interact = result.pickerEntries.find(
        e => e.profile === 'interact');
      expect(interact).to.be(undefined);
    });

    it('should emit interact picker entry when interactEnabled is ' +
      'false but user enables it', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {
          ...baseInput.workflow,
          interactEnabled: false
        },
        userSettings: {
          enabledWallets: [],
          enabledProfiles: ['interact']
        }
      });
      const interact = result.pickerEntries.find(
        e => e.method === 'qr-and-copy' && e.profile === 'interact');
      expect(interact).to.be.an('object');
    });

    it('should treat interactEnabled: true same as default', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {
          ...baseInput.workflow,
          interactEnabled: true
        }
      });
      expect(result.defaultProfiles.map(p => p.profile))
        .to.contain('interact');
      const interact = result.pickerEntries.find(
        e => e.method === 'qr-and-copy' && e.profile === 'interact');
      expect(interact).to.be.an('object');
    });
  });

  describe('LCW + vcapi special case', () => {
    it('should emit qr-and-link for vcapi when lcw enabled', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {
          protocols: {
            'OID4VP-draft18': 'openid4vp://test',
            vcapi: 'https://example.com/vcapi',
            interact: 'https://example.com/interact'
          }
        },
        systemWallets: ['lcw']
      });
      const vcapi = result.pickerEntries.find(
        e => e.method === 'qr-and-link' && e.profile === 'vcapi');
      expect(vcapi).to.be.an('object');
      expect(vcapi.walletIds).to.eql(['lcw']);
    });

    it('should not emit vcapi entry when lcw is not enabled', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {
          protocols: {
            'OID4VP-draft18': 'openid4vp://test',
            vcapi: 'https://example.com/vcapi'
          }
        },
        systemWallets: []
      });
      const vcapi = result.pickerEntries.find(
        e => e.profile === 'vcapi');
      expect(vcapi).to.be(undefined);
    });
  });

  describe('chapi', () => {
    it('should emit chapi when wallet supports it and chapi is available',
      () => {
        const result = computeExchangeOptions({
          ...baseInput,
          exchange: {
            protocols: {
              'OID4VP-draft18': 'openid4vp://test',
              chapi: 'https://example.com/chapi',
              interact: 'https://example.com/interact'
            }
          },
          systemWallets: ['lcw']
        });
        const chapi = result.pickerEntries.find(
          e => e.method === 'chapi');
        expect(chapi).to.be.an('object');
        expect(chapi.walletIds).to.contain('lcw');
      });

    it('should not emit chapi when no wallet supports it', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {
          protocols: {
            chapi: 'https://example.com/chapi',
            interact: 'https://example.com/interact'
          }
        },
        systemWallets: ['cadmv-android'],
        workflow: {query: [{format: ['mso_mdoc']}]}
      });
      const chapi = result.pickerEntries.find(e => e.method === 'chapi');
      expect(chapi).to.be(undefined);
    });
  });

  describe('sorting', () => {
    it('should order entries by INTERACTION_METHOD_PRIORITY then' +
      ' PROFILE_PRIORITY', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {
          protocols: {
            'OID4VP-draft18': 'openid4vp://test',
            interact: 'https://example.com/interact',
            chapi: 'https://example.com/chapi'
          }
        },
        systemWallets: ['lcw']
      });
      const methods = result.pickerEntries.map(e => e.method);
      const qrLinkIdx = methods.indexOf('qr-and-link');
      const qrCopyIdx = methods.indexOf('qr-and-copy');
      const chapiIdx = methods.indexOf('chapi');
      expect(qrLinkIdx).to.be.lessThan(qrCopyIdx);
      expect(qrCopyIdx).to.be.lessThan(chapiIdx);
    });

    it('should put aggregator dcapi before per-profile dcapi', () => {
      // Include google-wallet so the 18013-7-Annex-D per-profile dcapi
      // entry has matching walletIds and is actually emitted.
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {query: [{format: ['mso_mdoc']}]},
        exchange: {
          protocols: {
            'cadmv-android': 'https://x',
            '18013-7-Annex-D': 'https://x'
          }
        },
        systemWallets: ['cadmv-android', 'google-wallet'],
        userSettings: {
          enabledWallets: [],
          enabledProfiles: ['18013-7-Annex-D']
        },
        platform: {isIOS: false, isAndroid: true, isMobile: true},
        dcApiSystemAvailable: true
      });
      const dcapiEntries = result.pickerEntries.filter(
        e => e.method === 'dcapi');
      expect(dcapiEntries.length).to.be.greaterThan(1);
      expect(dcapiEntries[0].profile).to.be(null);
    });
  });

  describe('modal-shape regression', () => {
    it('should reflect enabledWallets in extraWallets.enabled', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {query: [{format: ['mso_mdoc']}]},
        exchange: {
          protocols: {'cadmv-android': 'https://x'}
        },
        systemWallets: [],
        userSettings: {
          enabledWallets: ['cadmv-android'],
          enabledProfiles: []
        },
        dcApiSystemAvailable: true
      });
      const android = result.extraWallets.find(
        w => w.walletId === 'cadmv-android');
      expect(android).to.be.an('object');
      expect(android.enabled).to.be(true);
      const ios = result.extraWallets.find(
        w => w.walletId === 'cadmv-ios');
      if(ios) {
        expect(ios.enabled).to.be(false);
      }
    });

    it('should reflect enabledProfiles in extraProfiles.enabled', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {
          protocols: {
            'OID4VP-draft18': 'openid4vp://test',
            'OID4VP-1.0': 'openid4vp://test2',
            interact: 'https://example.com/interact'
          }
        },
        userSettings: {
          enabledWallets: [],
          enabledProfiles: ['OID4VP-1.0']
        }
      });
      const oid4vp10 = result.extraProfiles.find(
        p => p.profile === 'OID4VP-1.0');
      expect(oid4vp10).to.be.an('object');
      expect(oid4vp10.enabled).to.be(true);
    });

    it('should exclude wallets not in systemWallets from defaultWallets',
      () => {
        const result = computeExchangeOptions({
          ...baseInput,
          systemWallets: ['lcw']
        });
        const defaultIds = result.defaultWallets.map(w => w.walletId);
        expect(defaultIds).to.not.contain('cadmv-android');
        expect(defaultIds).to.not.contain('cadmv-ios');
      });

    it('should exclude extraWallets with no compatible combo', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {query: [{format: ['mso_mdoc']}]},
        exchange: {
          protocols: {'cadmv-android': 'https://x'}
        },
        systemWallets: [],
        dcApiSystemAvailable: true
      });
      const lcwExtra = result.extraWallets.find(w => w.walletId === 'lcw');
      expect(lcwExtra).to.be(undefined);
    });

    it('should include oid4vpDefaultProfile in defaultProfiles when ' +
      'compatible', () => {
      const result = computeExchangeOptions(baseInput);
      expect(result.defaultProfiles.map(p => p.profile))
        .to.contain('OID4VP-draft18');
    });

    it('should have empty defaultProfiles when oid4vpDefaultProfile is ' +
      'not in exchange', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {protocols: {interact: 'https://example.com/interact'}},
        oid4vpDefaultProfile: 'OID4VP-1.0'
      });
      const defaults = result.defaultProfiles.map(p => p.profile);
      expect(defaults).to.not.contain('OID4VP-1.0');
    });

    it('should exclude vcapi from extraProfiles', () => {
      const result = computeExchangeOptions(baseInput);
      const vcapi = result.extraProfiles.find(p => p.profile === 'vcapi');
      expect(vcapi).to.be(undefined);
    });

    it('should mark disabled extraWallets as enabled=false', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {query: [{format: ['mso_mdoc']}]},
        exchange: {
          protocols: {
            'cadmv-android': 'https://x',
            'cadmv-ios': 'https://x'
          }
        },
        systemWallets: [],
        userSettings: {
          enabledWallets: ['cadmv-android'],
          enabledProfiles: []
        },
        dcApiSystemAvailable: true
      });
      const ios = result.extraWallets.find(
        w => w.walletId === 'cadmv-ios');
      if(ios) {
        expect(ios.enabled).to.be(false);
      }
    });

    it('should mark disabled extraProfiles as enabled=false', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {
          protocols: {
            'OID4VP-draft18': 'openid4vp://test',
            'OID4VP-1.0': 'openid4vp://test2',
            interact: 'https://example.com/interact'
          }
        },
        userSettings: {
          enabledWallets: [],
          enabledProfiles: []
        }
      });
      const oid4vp10 = result.extraProfiles.find(
        p => p.profile === 'OID4VP-1.0');
      expect(oid4vp10).to.be.an('object');
      expect(oid4vp10.enabled).to.be(false);
    });
  });

  describe('edge cases', () => {
    it('should return empty pickerEntries for empty formats', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {}
      });
      expect(result.pickerEntries).to.eql([]);
    });

    it('should return empty pickerEntries for empty exchange', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        exchange: {}
      });
      expect(result.pickerEntries).to.eql([]);
    });

    it('should handle dcApiEnabled=false on workflow', () => {
      const result = computeExchangeOptions({
        ...baseInput,
        workflow: {query: [{format: ['mso_mdoc']}], dcApiEnabled: false},
        exchange: {
          protocols: {'cadmv-android': 'https://x'}
        },
        systemWallets: ['cadmv-android'],
        dcApiSystemAvailable: true
      });
      const dcapi = result.pickerEntries.find(e => e.method === 'dcapi');
      expect(dcapi).to.be(undefined);
    });

    it('should use WALLETS_REGISTRY when no registry provided', () => {
      const result = computeExchangeOptions({
        workflow: {query: [{format: ['mso_mdoc']}]},
        exchange: {
          protocols: {'cadmv-android': 'https://x'}
        },
        systemWallets: ['cadmv-android'],
        userSettings: {},
        platform: {},
        dcApiSystemAvailable: true
      });
      const dcapi = result.pickerEntries.find(
        e => e.method === 'dcapi' && e.profile === null);
      expect(dcapi).to.be.an('object');
    });
  });

  describe('name projection into wallet entries', () => {
    const namedRegistry = {
      'cadmv-android': {
        id: 'cadmv-android',
        name: 'CA DMV Wallet on Android',
        productName: 'CA DMV Wallet',
        platform: ['android'],
        supportedFormats: ['mso_mdoc'],
        supportedProfiles: {'cadmv-android': {dcapi: {formats: ['mso_mdoc']}}}
      }
    };
    const namedInput = {
      workflow: {query: [{format: ['mso_mdoc']}]},
      exchange: {protocols: {'cadmv-android': 'https://x'}},
      systemWallets: ['cadmv-android'],
      userSettings: {enabledWallets: [], enabledProfiles: []},
      platform: {isAndroid: true},
      dcApiSystemAvailable: true,
      registry: namedRegistry
    };

    it('projects both device-context name and product name onto entries',
      () => {
        const result = computeExchangeOptions(namedInput);
        const entry = result.defaultWallets.find(
          w => w.walletId === 'cadmv-android');
        expect(entry.name).to.be('CA DMV Wallet on Android');
        expect(entry.productName).to.be('CA DMV Wallet');
      });

    it('omits productName when the wallet declares none', () => {
      const result = computeExchangeOptions({
        ...namedInput,
        registry: {
          'google-wallet': {
            id: 'google-wallet',
            name: 'Google Wallet',
            platform: ['android'],
            supportedFormats: ['mso_mdoc'],
            supportedProfiles: {
              'google-wallet': {dcapi: {formats: ['mso_mdoc']}}
            }
          }
        },
        exchange: {protocols: {'google-wallet': 'https://x'}},
        systemWallets: ['google-wallet']
      });
      const entry = result.defaultWallets.find(
        w => w.walletId === 'google-wallet');
      expect(entry.name).to.be('Google Wallet');
      expect(entry).to.not.have.property('productName');
    });
  });
});
