/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {
  buildExtendedRegistryForPicker,
  getPickerOptions,
  WALLETS_REGISTRY
} from '../../../common/wallets/index.js';

describe('getPickerOptions', () => {
  const baseOptions = {
    formats: ['ldp_vc'],
    exchange: {
      protocols: {
        'OID4VP-draft18': 'openid4vp://test',
        interact: 'https://example.com/interact'
      }
    },
    availableProtocols: ['OID4VP-draft18', 'interact'],
    enabledWallets: ['cadmv-wallet', 'lcw', 'interaction'],
    dcApiSystemAvailable: false,
    dcApiErrorOverride: false,
    workflow: {},
    registry: WALLETS_REGISTRY
  };

  it('should return empty array when formats is empty', () => {
    const result = getPickerOptions({
      ...baseOptions,
      formats: []
    });
    expect(result).to.eql([]);
  });

  it('should return empty array when no compatible wallets', () => {
    const result = getPickerOptions({
      ...baseOptions,
      enabledWallets: ['nonexistent']
    });
    expect(result).to.eql([]);
  });

  it('should return qr-and-link option for single OID4VP protocol', () => {
    const result = getPickerOptions(baseOptions);
    const qrLink = result.filter(o => o.method === 'qr-and-link');
    expect(qrLink.length).to.be.greaterThan(0);
    expect(qrLink[0]).to.have.property('protocolId', 'OID4VP-draft18');
    expect(qrLink[0]).to.have.property('walletIds');
    expect(qrLink[0].walletIds).to.contain('cadmv-wallet');
  });

  it('should return qr-and-copy option for interact protocol', () => {
    const result = getPickerOptions(baseOptions);
    const qrCopy = result.find(o =>
      o.method === 'qr-and-copy' && o.protocolId === 'interact');
    expect(qrCopy).to.be.an('object');
    expect(qrCopy.walletIds).to.contain('interaction');
  });

  it('should return one qr-and-link per OID4VP protocol that has compatible' +
    'wallets', () => {
    const result = getPickerOptions({
      ...baseOptions,
      exchange: {
        protocols: {
          'OID4VP-draft18': 'openid4vp://test1',
          'OID4VP-1.0': 'openid4vp://test2',
          interact: 'https://example.com/interact'
        }
      },
      availableProtocols: ['OID4VP-draft18', 'OID4VP-1.0', 'interact']
    });
    const qrLink = result.filter(o => o.method === 'qr-and-link');
    expect(qrLink.length).to.be.greaterThan(0);
    expect(qrLink[0].protocolId).to.be('OID4VP-draft18');
    expect(qrLink[0].walletIds).to.contain('cadmv-wallet');
  });

  it('should return both OID4VP options when enabledProtocols includes' +
    'OID4VP-1.0', () => {
    const {extendedRegistry, extendedWalletIds} =
      buildExtendedRegistryForPicker({
        enabledWallets: baseOptions.enabledWallets,
        enabledProtocols: ['OID4VP-1.0'],
        availableProtocols: ['OID4VP-draft18', 'OID4VP-1.0'],
        formats: baseOptions.formats,
        registry: baseOptions.registry
      });
    const result = getPickerOptions({
      ...baseOptions,
      exchange: {
        protocols: {
          'OID4VP-draft18': 'openid4vp://test1',
          'OID4VP-1.0': 'openid4vp://test2',
          interact: 'https://example.com/interact'
        }
      },
      availableProtocols: ['OID4VP-draft18', 'OID4VP-1.0', 'interact'],
      enabledWallets: extendedWalletIds,
      registry: extendedRegistry
    });
    const qrLink = result.filter(o => o.method === 'qr-and-link');
    expect(qrLink.length).to.be(2);
    const draft18Option = qrLink.find(o => o.protocolId === 'OID4VP-draft18');
    const v10Option = qrLink.find(o => o.protocolId === 'OID4VP-1.0');
    expect(draft18Option).to.be.an('object');
    expect(draft18Option.walletIds).to.contain('cadmv-wallet');
    expect(v10Option).to.be.an('object');
    expect(v10Option.walletIds).to.contain('protocol-OID4VP-1.0');
  });

  it('should return LCW-specific vcapi option when vcapi available', () => {
    const result = getPickerOptions({
      ...baseOptions,
      exchange: {
        protocols: {
          'OID4VP-draft18': 'openid4vp://test',
          vcapi: 'https://example.com/vcapi',
          interact: 'https://example.com/interact'
        }
      },
      availableProtocols: ['OID4VP-draft18', 'vcapi', 'interact'],
      enabledWallets: ['cadmv-wallet', 'lcw', 'interaction']
    });
    const lcwOption = result.find(o =>
      o.method === 'qr-and-link' &&
      o.protocolId === 'vcapi' &&
      o.walletId === 'lcw');
    expect(lcwOption).to.be.an('object');
    expect(lcwOption.labelKey).to.be('interactionMethod_qr-and-link_lcw');
    expect(lcwOption.walletIds).to.eql(['lcw']);
  });

  it('should not return dcapi when dcApiSystemAvailable is false', () => {
    const result = getPickerOptions({
      ...baseOptions,
      formats: ['mso_mdoc'],
      exchange: {
        protocols: {
          '18013-7-Annex-D': 'https://example.com/annex-d'
        }
      },
      availableProtocols: ['18013-7-Annex-D'],
      enabledWallets: ['cadmv-wallet', 'google-wallet'],
      dcApiSystemAvailable: false
    });
    const dcapi = result.find(o => o.method === 'dcapi');
    expect(dcapi).to.be(undefined);
  });

  it('should return dcapi when dcApiSystemAvailable and mso_mdoc', () => {
    const result = getPickerOptions({
      ...baseOptions,
      formats: ['mso_mdoc'],
      exchange: {
        protocols: {
          '18013-7-Annex-D': 'https://example.com/annex-d'
        }
      },
      availableProtocols: ['18013-7-Annex-D'],
      enabledWallets: ['cadmv-wallet', 'google-wallet'],
      dcApiSystemAvailable: true
    });
    const dcapi = result.find(o => o.method === 'dcapi');
    expect(dcapi).to.be.an('object');
    expect(dcapi.walletIds.length).to.be.greaterThan(0);
  });

  it('should not return dcapi when dcApiErrorOverride is true', () => {
    const result = getPickerOptions({
      ...baseOptions,
      formats: ['mso_mdoc'],
      exchange: {
        protocols: {
          '18013-7-Annex-D': 'https://example.com/annex-d'
        }
      },
      availableProtocols: ['18013-7-Annex-D'],
      enabledWallets: ['cadmv-wallet', 'google-wallet'],
      dcApiSystemAvailable: true,
      dcApiErrorOverride: true
    });
    const dcapi = result.find(o => o.method === 'dcapi');
    expect(dcapi).to.be(undefined);
  });

  it('should return chapi when chapi in availableProtocols', () => {
    const result = getPickerOptions({
      ...baseOptions,
      exchange: {
        protocols: {
          'OID4VP-draft18': 'openid4vp://test',
          chapi: 'https://example.com/chapi',
          interact: 'https://example.com/interact'
        }
      },
      availableProtocols: ['OID4VP-draft18', 'chapi', 'interact'],
      enabledWallets: ['cadmv-wallet', 'lcw', 'interaction']
    });
    const chapi = result.find(o => o.method === 'chapi');
    expect(chapi).to.be.an('object');
    expect(chapi.walletIds).to.contain('lcw');
  });

  it('should order options by INTERACTION_METHOD_PRIORITY', () => {
    const result = getPickerOptions({
      ...baseOptions,
      exchange: {
        protocols: {
          'OID4VP-draft18': 'openid4vp://test',
          interact: 'https://example.com/interact'
        }
      },
      availableProtocols: ['OID4VP-draft18', 'interact']
    });
    const methods = result.map(o => o.method);
    const qrLinkIdx = methods.indexOf('qr-and-link');
    const qrCopyIdx = methods.indexOf('qr-and-copy');
    expect(qrLinkIdx).to.be.lessThan(qrCopyIdx);
  });

  it('should return qr-and-link option for OID4VP-1.0 with protocol wallet' +
    'when enabled and available but no named wallet supports it', () => {
    const {extendedRegistry, extendedWalletIds} =
      buildExtendedRegistryForPicker({
        enabledWallets: ['lcw', 'interaction'],
        enabledProtocols: ['OID4VP-1.0'],
        availableProtocols: ['OID4VP-1.0'],
        formats: ['ldp_vc'],
        registry: WALLETS_REGISTRY
      });
    const result = getPickerOptions({
      formats: ['ldp_vc'],
      exchange: {
        protocols: {
          'OID4VP-1.0': 'openid4vp://test'
        }
      },
      availableProtocols: ['OID4VP-1.0'],
      enabledWallets: extendedWalletIds,
      registry: extendedRegistry
    });
    const qrLink = result.find(o =>
      o.method === 'qr-and-link' && o.protocolId === 'OID4VP-1.0');
    expect(qrLink).to.be.an('object');
    expect(qrLink.walletIds).to.contain('protocol-OID4VP-1.0');
  });

  it('should return qr-and-link option for OID4VP-1.0 when it is' +
    'OID4VPdefault even if not in enabledProtocols', () => {
    const {extendedRegistry, extendedWalletIds} =
      buildExtendedRegistryForPicker({
        enabledWallets: ['lcw', 'interaction'],
        enabledProtocols: [],
        availableProtocols: ['OID4VP-1.0'],
        formats: ['ldp_vc'],
        registry: WALLETS_REGISTRY,
        OID4VPdefault: 'OID4VP-1.0'
      });
    const result = getPickerOptions({
      formats: ['ldp_vc'],
      exchange: {
        protocols: {
          'OID4VP-1.0': 'openid4vp://test'
        }
      },
      availableProtocols: ['OID4VP-1.0'],
      enabledWallets: extendedWalletIds,
      registry: extendedRegistry
    });
    const qrLink = result.find(o =>
      o.method === 'qr-and-link' && o.protocolId === 'OID4VP-1.0');
    expect(qrLink).to.be.an('object');
    expect(qrLink.walletIds).to.contain('protocol-OID4VP-1.0');
  });

  it('should return chapi option with protocol wallet when chapi is' +
    'enabled and available', () => {
    const {extendedRegistry, extendedWalletIds} =
      buildExtendedRegistryForPicker({
        enabledWallets: ['interaction'],
        enabledProtocols: ['chapi'],
        availableProtocols: ['chapi'],
        formats: ['ldp_vc'],
        registry: WALLETS_REGISTRY
      });
    const result = getPickerOptions({
      formats: ['ldp_vc'],
      exchange: {
        protocols: {
          chapi: 'https://example.com/chapi'
        }
      },
      availableProtocols: ['chapi'],
      enabledWallets: extendedWalletIds,
      registry: extendedRegistry
    });
    const chapi = result.find(o => o.method === 'chapi');
    expect(chapi).to.be.an('object');
    expect(chapi.walletIds).to.contain('protocol-chapi');
  });
});
