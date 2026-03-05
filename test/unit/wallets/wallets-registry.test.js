/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {
  extractCredentialFormats,
  filterWalletsByFormatSupport,
  getProtocolInteractionMethods,
  getUrlDefault,
  getWalletsSupportingFormat,
  PROTOCOL_FORMAT_MAPPING,
  selectInitialProtocolInteraction,
  WALLETS_REGISTRY
} from '../../../common/wallets/index.js';

describe('Wallet Registry and Helper Functions', () => {
  describe('WALLETS_REGISTRY', () => {
    it('should contain all expected wallets', () => {
      expect(WALLETS_REGISTRY).to.have.property('cadmv-wallet');
      expect(WALLETS_REGISTRY).to.have.property('lcw');
      expect(WALLETS_REGISTRY).to.have.property('google-wallet');
      expect(WALLETS_REGISTRY).to.have.property('apple-wallet');
      expect(WALLETS_REGISTRY).to.have.property('interaction');
    });

    it('should have wallet objects with required structure', () => {
      const wallet = WALLETS_REGISTRY['cadmv-wallet'];
      expect(wallet).to.be.an('object');
      expect(wallet).to.have.property('id');
      expect(wallet).to.have.property('supportedFormats');
      expect(wallet).to.have.property('supportedProtocols');
    });
  });

  describe('getWalletsSupportingFormat', () => {
    it('should return correct wallets for ldp_vc format', () => {
      const result = getWalletsSupportingFormat({
        walletIds: ['cadmv-wallet', 'lcw', 'google-wallet', 'apple-wallet'],
        format: 'ldp_vc'
      });
      expect(result).to.be.an('array');
      expect(result).to.contain('cadmv-wallet');
      expect(result).to.contain('lcw');
      expect(result).to.not.contain('google-wallet');
      expect(result).to.not.contain('apple-wallet');
    });

    it('should return correct wallets for jwt_vc_json format', () => {
      const result = getWalletsSupportingFormat({
        walletIds: ['cadmv-wallet', 'lcw', 'google-wallet'],
        format: 'jwt_vc_json'
      });
      expect(result).to.be.an('array');
      expect(result).to.contain('cadmv-wallet');
      expect(result).to.not.contain('lcw');
      expect(result).to.not.contain('google-wallet');
    });

    it('should return correct wallets for mso_mdoc format', () => {
      const result = getWalletsSupportingFormat({
        walletIds: ['cadmv-wallet', 'lcw', 'google-wallet', 'apple-wallet'],
        format: 'mso_mdoc'
      });
      expect(result).to.be.an('array');
      expect(result).to.contain('cadmv-wallet');
      expect(result).to.contain('google-wallet');
      expect(result).to.contain('apple-wallet');
      expect(result).to.not.contain('lcw');
    });

    it('should return empty array for unsupported format', () => {
      const result = getWalletsSupportingFormat({
        walletIds: ['cadmv-wallet', 'lcw'],
        format: 'unsupported_format'
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should return empty array for empty walletIds', () => {
      const result = getWalletsSupportingFormat({
        walletIds: [],
        format: 'ldp_vc'
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should handle invalid walletIds', () => {
      const result = getWalletsSupportingFormat({
        walletIds: ['invalid-wallet-1', 'invalid-wallet-2'],
        format: 'ldp_vc'
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should handle mix of valid and invalid walletIds', () => {
      const result = getWalletsSupportingFormat({
        walletIds: ['cadmv-wallet', 'invalid-wallet', 'lcw'],
        format: 'ldp_vc'
      });
      expect(result).to.be.an('array');
      expect(result).to.contain('cadmv-wallet');
      expect(result).to.contain('lcw');
      expect(result.length).to.be(2);
    });

    it('should return empty array for invalid format', () => {
      const result = getWalletsSupportingFormat({
        walletIds: ['cadmv-wallet'],
        format: null
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should return empty array for non-array walletIds', () => {
      const result = getWalletsSupportingFormat({
        walletIds: 'not-an-array',
        format: 'ldp_vc'
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });
  });

  describe('getProtocolInteractionMethods', () => {
    const mockExchange = {
      protocols: {
        'OID4VP-draft18': 'openid4vp://?request_uri=https://example.com/request',
        '18013-7-Annex-D': 'https://example.com/annex-d',
        '18013-7-Annex-C': 'https://example.com/annex-c',
        vcapi: 'https://example.com/exchanges/123',
        chapi: 'https://example.com/chapi'
      }
    };

    it('should return correct ordered list for cadmv-wallet + ldp_vc', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'cadmv-wallet',
        format: 'ldp_vc',
        exchange: mockExchange
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
      // Should have link and qr methods for OID4VP-draft18
      const methods = result.map(r => r.interactionMethod);
      expect(methods).to.contain('link');
      expect(methods).to.contain('qr');
    });

    it('should return correct list for cadmv-wallet + jwt_vc_json', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'cadmv-wallet',
        format: 'jwt_vc_json',
        exchange: mockExchange
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
      // Should have link and qr methods for OID4VP-draft18
      const methods = result.map(r => r.interactionMethod);
      expect(methods).to.contain('link');
      expect(methods).to.contain('qr');
    });

    it('should return correct ordered list for cadmv-wallet + mso_mdoc', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'cadmv-wallet',
        format: 'mso_mdoc',
        exchange: mockExchange
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
      // Should have dcapi method for 18013-7-Annex-D
      const methods = result.map(r => r.interactionMethod);
      expect(methods).to.contain('dcapi');
    });

    it('should return correct ordered list for lcw + ldp_vc', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'lcw',
        format: 'ldp_vc',
        exchange: mockExchange
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
      // Should have qr, link, and chapi methods
      const methods = result.map(r => r.interactionMethod);
      expect(methods).to.contain('qr');
      expect(methods).to.contain('link');
      expect(methods).to.contain('chapi');
    });

    it('should return empty array for unsupported walletId', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'invalid-wallet',
        format: 'ldp_vc',
        exchange: mockExchange
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should return empty array for unsupported format', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'lcw',
        format: 'unsupported_format',
        exchange: mockExchange
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should return empty array for null walletId', () => {
      const result = getProtocolInteractionMethods({
        walletId: null,
        format: 'ldp_vc',
        exchange: mockExchange
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should return empty array for null format', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'cadmv-wallet',
        format: null,
        exchange: mockExchange
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should verify ordering (interaction method priority)', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'lcw',
        format: 'ldp_vc',
        exchange: mockExchange
      });
      expect(result.length).to.be.greaterThan(0);
      // link should come before qr (link priority 1, qr priority 2)
      const linkIndex = result.findIndex(r => r.interactionMethod === 'link');
      const qrIndex = result.findIndex(r => r.interactionMethod === 'qr');
      if(linkIndex !== -1 && qrIndex !== -1) {
        expect(linkIndex).to.be.lessThan(qrIndex);
      }
    });

    it('should verify request/URL generation for qr method', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'cadmv-wallet',
        format: 'ldp_vc',
        exchange: mockExchange
      });
      const qrMethod = result.find(r => r.interactionMethod === 'qr');
      if(qrMethod) {
        expect(qrMethod).to.have.property('request');
        expect(qrMethod.request).to.be.a('string');
        expect(qrMethod.request).to.be(mockExchange.protocols[
          'OID4VP-draft18']);
      }
    });

    it('should verify request/URL generation for link method', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'cadmv-wallet',
        format: 'ldp_vc',
        exchange: mockExchange
      });
      const linkMethod = result.find(r => r.interactionMethod === 'link');
      if(linkMethod) {
        expect(linkMethod).to.have.property('request');
        expect(linkMethod.request).to.be.a('string');
        expect(linkMethod.request).to.be(mockExchange.protocols[
          'OID4VP-draft18']);
      }
    });

    it('should verify request generation for chapi method', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'lcw',
        format: 'ldp_vc',
        exchange: mockExchange
      });
      const chapiMethod = result.find(r => r.interactionMethod === 'chapi');
      if(chapiMethod) {
        expect(chapiMethod).to.have.property('request');
        expect(chapiMethod.request).to.be.an('object');
        expect(chapiMethod.request).to.have.property('web');
      }
    });

    it('should handle missing exchange protocols gracefully', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'cadmv-wallet',
        format: 'ldp_vc',
        exchange: {protocols: {}}
      });
      // Should return empty array when protocols are missing
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should handle missing exchange object gracefully', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'cadmv-wallet',
        format: 'ldp_vc',
        exchange: null
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should use custom getUrl function when available', () => {
      const result = getProtocolInteractionMethods({
        walletId: 'lcw',
        format: 'ldp_vc',
        exchange: mockExchange
      });
      const qrMethod = result.find(r =>
        r.interactionMethod === 'qr' && r.protocolId === 'vcapi');
      if(qrMethod) {
        expect(qrMethod.request).to.be.a('string');
        expect(qrMethod.request).to.contain('https://lcw.app/request');
      }
    });
  });

  describe('Constants', () => {
    it('should have PROTOCOL_FORMAT_MAPPING with expected mappings', () => {
      const draft18 = PROTOCOL_FORMAT_MAPPING['OID4VP-draft18'];
      const annexC = PROTOCOL_FORMAT_MAPPING['18013-7-Annex-C'];
      const annexD = PROTOCOL_FORMAT_MAPPING['18013-7-Annex-D'];
      expect(PROTOCOL_FORMAT_MAPPING).to.be.an('object');
      expect(draft18).to.be.an('array');
      expect(draft18).to.contain('ldp_vc');
      expect(draft18).to.contain('jwt_vc_json');
      expect(draft18.length).to.be(2);
      expect(PROTOCOL_FORMAT_MAPPING['OID4VP-1.0']).to.contain('ldp_vc');
      expect(PROTOCOL_FORMAT_MAPPING['OID4VP-1.0']).to.contain('jwt_vc_json');
      expect(annexC).to.contain('mso_mdoc');
      expect(annexC.length).to.be(1);
      expect(annexD).to.contain('mso_mdoc');
      expect(annexD.length).to.be(1);
      expect(PROTOCOL_FORMAT_MAPPING.vcapi).to.contain('ldp_vc');
      expect(PROTOCOL_FORMAT_MAPPING.vcapi.length).to.be(1);
      expect(PROTOCOL_FORMAT_MAPPING.chapi).to.contain('ldp_vc');
      expect(PROTOCOL_FORMAT_MAPPING.chapi.length).to.be(1);
    });
  });

  describe('getUrlDefault', () => {
    it('should return protocol URL from exchange', () => {
      const exchange = {
        protocols: {
          'OID4VP-draft18': 'openid4vp://test'
        }
      };
      const result = getUrlDefault({exchange, protocol: 'OID4VP-draft18'});
      expect(result).to.be('openid4vp://test');
    });

    it('should return null when protocol not in exchange', () => {
      const exchange = {
        protocols: {}
      };
      const result = getUrlDefault({exchange, protocol: 'OID4VP-draft18'});
      expect(result).to.be(null);
    });

    it('should return null when exchange is null', () => {
      const result = getUrlDefault(
        {exchange: null, protocol: 'OID4VP-draft18'});
      expect(result).to.be(null);
    });
  });

  describe('Edge cases', () => {
    it('should handle wallet with no supported protocols', () => {
      // Create a mock wallet with no supportedProtocols
      const mockWallet = {
        id: 'test-wallet',
        name: 'Test Wallet',
        supportedFormats: ['ldp_vc'],
        supportedProtocols: {}
      };
      const testRegistry = {
        'test-wallet': mockWallet
      };
      const result = getProtocolInteractionMethods({
        walletId: 'test-wallet',
        format: 'ldp_vc',
        exchange: {protocols: {'OID4VP-draft18': 'test'}},
        registry: testRegistry
      });
      // Should return empty array when wallet has no supported protocols
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should handle protocol with no interaction methods for format', () => {
      // This is tested implicitly - if a protocol doesn't support a format,
      // it won't appear in results
      const result = getProtocolInteractionMethods({
        walletId: 'lcw',
        format: 'mso_mdoc', // LCW doesn't support mso_mdoc
        exchange: {protocols: {vcapi: 'test'}}
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });
  });

  describe('extractCredentialFormats', () => {
    it('should extract formats from simplified query format', () => {
      const workflow = {
        query: [
          {format: ['mso_mdoc']},
          {format: ['ldp_vc', 'jwt_vc_json']}
        ]
      };
      const result = extractCredentialFormats(workflow);
      expect(result).to.be.an('array');
      expect(result).to.contain('mso_mdoc');
      expect(result).to.contain('ldp_vc');
      expect(result).to.contain('jwt_vc_json');
      expect(result.length).to.be(3);
    });

    it('should handle single format string', () => {
      const workflow = {
        query: [
          {format: 'ldp_vc'}
        ]
      };
      const result = extractCredentialFormats(workflow);
      expect(result).to.be.an('array');
      expect(result).to.contain('ldp_vc');
      expect(result.length).to.be(1);
    });

    it('should deduplicate formats', () => {
      const workflow = {
        query: [
          {format: ['ldp_vc', 'mso_mdoc']},
          {format: ['ldp_vc']}
        ]
      };
      const result = extractCredentialFormats(workflow);
      expect(result).to.be.an('array');
      expect(result).to.contain('ldp_vc');
      expect(result).to.contain('mso_mdoc');
      expect(result.length).to.be(2);
    });

    it('should extract formats from DCQL query format', () => {
      const workflow = {
        dcql_query: {
          credentials: [
            {format: ['mso_mdoc']},
            {query: {format: ['ldp_vc']}}
          ]
        }
      };
      const result = extractCredentialFormats(workflow);
      expect(result).to.be.an('array');
      expect(result).to.contain('mso_mdoc');
      expect(result).to.contain('ldp_vc');
      expect(result.length).to.be(2);
    });

    it('should handle empty workflow', () => {
      const result = extractCredentialFormats(null);
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should handle workflow with no query', () => {
      const workflow = {};
      const result = extractCredentialFormats(workflow);
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should handle invalid query structure', () => {
      const workflow = {
        query: [
          {format: null},
          {format: 123}
        ]
      };
      const result = extractCredentialFormats(workflow);
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });
  });

  describe('filterWalletsByFormatSupport', () => {
    it('should filter wallets by single format', () => {
      const result = filterWalletsByFormatSupport({
        walletIds: ['cadmv-wallet', 'lcw', 'google-wallet', 'apple-wallet'],
        formats: ['ldp_vc']
      });
      expect(result).to.be.an('array');
      expect(result).to.contain('cadmv-wallet');
      expect(result).to.contain('lcw');
      expect(result).to.not.contain('google-wallet');
      expect(result).to.not.contain('apple-wallet');
    });

    it('should filter wallets by multiple formats', () => {
      const result = filterWalletsByFormatSupport({
        walletIds: ['cadmv-wallet', 'lcw', 'google-wallet', 'apple-wallet'],
        formats: ['mso_mdoc', 'ldp_vc']
      });
      expect(result).to.be.an('array');
      expect(result).to.contain('cadmv-wallet'); // supports both
      expect(result).to.contain('lcw'); // supports ldp_vc
      expect(result).to.contain('google-wallet'); // supports mso_mdoc
      expect(result).to.contain('apple-wallet'); // supports mso_mdoc
    });

    it('should return empty array for no matching wallets', () => {
      const result = filterWalletsByFormatSupport({
        walletIds: ['lcw'],
        formats: ['mso_mdoc'] // LCW doesn't support mso_mdoc
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should return empty array for empty wallet list', () => {
      const result = filterWalletsByFormatSupport({
        walletIds: [],
        formats: ['ldp_vc']
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should return empty array for empty format list', () => {
      const result = filterWalletsByFormatSupport({
        walletIds: ['cadmv-wallet', 'lcw'],
        formats: []
      });
      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should handle invalid inputs', () => {
      expect(filterWalletsByFormatSupport({
        walletIds: null,
        formats: ['ldp_vc']
      })).to.eql([]);
      expect(filterWalletsByFormatSupport({
        walletIds: ['cadmv-wallet'],
        formats: null
      })).to.eql([]);
    });
  });

  describe('selectInitialProtocolInteraction', () => {
    const mockExchange = {
      protocols: {
        'OID4VP-draft18': 'openid4vp://test',
        '18013-7-Annex-D': 'test'
      }
    };

    it('should select dcapi for mobile platform', () => {
      const result = selectInitialProtocolInteraction({
        walletIds: ['cadmv-wallet'],
        formats: ['mso_mdoc'],
        exchange: mockExchange,
        isMobile: true
      });
      expect(result).to.be.an('object');
      expect(result).to.not.be(null);
      expect(result.interactionMethod).to.be('dcapi');
      expect(result.walletId).to.be('cadmv-wallet');
    });

    it('should select qr for desktop platform', () => {
      const result = selectInitialProtocolInteraction({
        walletIds: ['cadmv-wallet'],
        formats: ['ldp_vc'],
        exchange: mockExchange,
        isMobile: false
      });
      expect(result).to.be.an('object');
      expect(result).to.not.be(null);
      // On desktop, qr should be selected (or link if available)
      expect(['qr', 'link']).to.contain(result.interactionMethod);
      expect(result.walletId).to.be('cadmv-wallet');
    });

    it('should prioritize same-device methods on mobile', () => {
      const result = selectInitialProtocolInteraction({
        walletIds: ['cadmv-wallet'],
        formats: ['ldp_vc'],
        exchange: mockExchange,
        isMobile: true
      });
      expect(result).to.be.an('object');
      expect(result).to.not.be(null);
      // Should prioritize link over qr on mobile
      expect(['dcapi', 'link']).to.contain(result.interactionMethod);
    });

    it('should return null for no available combinations', () => {
      const result = selectInitialProtocolInteraction({
        walletIds: ['lcw'],
        formats: ['mso_mdoc'], // LCW doesn't support mso_mdoc
        exchange: mockExchange,
        isMobile: false
      });
      expect(result).to.be(null);
    });

    it('should return null for empty wallet list', () => {
      const result = selectInitialProtocolInteraction({
        walletIds: [],
        formats: ['ldp_vc'],
        exchange: mockExchange,
        isMobile: false
      });
      expect(result).to.be(null);
    });

    it('should return null for empty format list', () => {
      const result = selectInitialProtocolInteraction({
        walletIds: ['cadmv-wallet'],
        formats: [],
        exchange: mockExchange,
        isMobile: false
      });
      expect(result).to.be(null);
    });

    it('should select first available combination by priority', () => {
      const result = selectInitialProtocolInteraction({
        walletIds: ['cadmv-wallet'],
        formats: ['ldp_vc'],
        exchange: mockExchange,
        isMobile: false
      });
      expect(result).to.be.an('object');
      expect(result).to.not.be(null);
      expect(result.walletId).to.be('cadmv-wallet');
      expect(result.protocolId).to.be('OID4VP-draft18');
    });

    it('should handle multiple wallets and select best match', () => {
      const result = selectInitialProtocolInteraction({
        walletIds: ['cadmv-wallet', 'lcw'],
        formats: ['ldp_vc'],
        exchange: mockExchange,
        isMobile: false
      });
      expect(result).to.be.an('object');
      expect(result).to.not.be(null);
      expect(['cadmv-wallet', 'lcw']).to.contain(result.walletId);
    });
  });
});
