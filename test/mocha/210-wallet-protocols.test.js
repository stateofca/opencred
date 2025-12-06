/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {
  generateWalletLink,
  walletSupportsProtocol
} from '../../web/utils/wallets.js';

describe('Wallet Protocols', () => {
  describe('walletSupportsProtocol', () => {
    describe('CA DMV Wallet', () => {
      it('should support expected protocols', () => {
        // OID4VP-1.0
        expect(walletSupportsProtocol('cadmv-wallet', 'OID4VP-1.0', 'qr'))
          .to.be(true);
        expect(walletSupportsProtocol('cadmv-wallet', 'OID4VP-1.0', 'link'))
          .to.be(true);
        expect(walletSupportsProtocol('cadmv-wallet', 'OID4VP-1.0', 'dcapi'))
          .to.be(true);

        // OID4VP-draft18
        expect(walletSupportsProtocol('cadmv-wallet', 'OID4VP-draft18', 'qr'))
          .to.be(true);
        expect(walletSupportsProtocol('cadmv-wallet', 'OID4VP-draft18', 'link'))
          .to.be(true);
        expect(walletSupportsProtocol(
          'cadmv-wallet', 'OID4VP-draft18', 'dcapi')).to.be(true);

        // OID4VP-combined
        expect(walletSupportsProtocol('cadmv-wallet', 'OID4VP-combined', 'qr'))
          .to.be(true);
        expect(walletSupportsProtocol(
          'cadmv-wallet', 'OID4VP-combined', 'link')).to.be(true);
        expect(walletSupportsProtocol(
          'cadmv-wallet', 'OID4VP-combined', 'dcapi')).to.be(false);

        // 18013-7-Annex-D
        expect(walletSupportsProtocol(
          'cadmv-wallet', '18013-7-Annex-D', 'dcapi')).to.be(true);
        expect(walletSupportsProtocol('cadmv-wallet', '18013-7-Annex-D', 'qr'))
          .to.be(false);
        expect(walletSupportsProtocol(
          'cadmv-wallet', '18013-7-Annex-D', 'link')).to.be(false);
      });
    });

    describe('LCW', () => {
      it('should support vcapi with qr interaction', () => {
        expect(walletSupportsProtocol('lcw', 'vcapi', 'qr'))
          .to.be(true);
      });

      it('should support vcapi with link interaction', () => {
        expect(walletSupportsProtocol('lcw', 'vcapi', 'link'))
          .to.be(true);
      });

      it('should not support vcapi with dcapi interaction', () => {
        expect(walletSupportsProtocol('lcw', 'vcapi', 'dcapi'))
          .to.be(false);
      });
    });

    describe('Edge cases', () => {
      it('should return false for invalid wallet ID', () => {
        expect(walletSupportsProtocol('invalid-wallet', 'OID4VP-1.0', 'qr'))
          .to.be(false);
      });

      it('should return false for invalid protocol', () => {
        expect(walletSupportsProtocol('cadmv-wallet', 'invalid-protocol', 'qr'))
          .to.be(false);
      });

      it('should return false for invalid interaction type', () => {
        expect(walletSupportsProtocol('cadmv-wallet', 'OID4VP-1.0', 'invalid'))
          .to.be(false);
      });

      it('should return false for null wallet ID', () => {
        expect(walletSupportsProtocol(null, 'OID4VP-1.0', 'qr'))
          .to.be(false);
      });

      it('should return false for null protocol', () => {
        expect(walletSupportsProtocol('cadmv-wallet', null, 'qr'))
          .to.be(false);
      });

      it('should return false for null interaction type', () => {
        expect(walletSupportsProtocol('cadmv-wallet', 'OID4VP-1.0', null))
          .to.be(false);
      });

      it('should return false for empty string wallet ID', () => {
        expect(walletSupportsProtocol('', 'OID4VP-1.0', 'qr'))
          .to.be(false);
      });
    });
  });

  describe('generateWalletLink', () => {
    describe('CA DMV Wallet', () => {
      it('should generate link for OID4VP-1.0 with qr', () => {
        const exchange = {
          protocols: {
            'OID4VP-1.0': 'openid4vp://?request_uri=https://example.com/request'
          },
          challenge: 'test-challenge'
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'cadmv-wallet',
          protocol: 'OID4VP-1.0',
          interactionMethod: 'qr'
        });

        expect(link).to.equal(exchange.protocols['OID4VP-1.0']);
      });

      it('should generate link for OID4VP-1.0 with link', () => {
        const exchange = {
          protocols: {
            'OID4VP-1.0': 'openid4vp://?request_uri=https://example.com/request'
          },
          challenge: 'test-challenge'
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'cadmv-wallet',
          protocol: 'OID4VP-1.0',
          interactionMethod: 'link'
        });

        expect(link).to.equal('openid4vp://?request_uri=https://example.com/request');
      });

      it('should generate link for OID4VP-draft18 with qr', () => {
        const exchange = {
          protocols: {
            'OID4VP-draft18': 'openid4vp://?request_uri=https://example.com/request'
          },
          challenge: 'test-challenge'
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'cadmv-wallet',
          protocol: 'OID4VP-draft18',
          interactionMethod: 'qr'
        });

        expect(link).to.equal('openid4vp://?request_uri=https://example.com/request');
      });

      it('should generate link for OID4VP-draft18 with link', () => {
        const exchange = {
          protocols: {
            'OID4VP-draft18': 'openid4vp://?request_uri=https://example.com/request'
          },
          challenge: 'test-challenge'
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'cadmv-wallet',
          protocol: 'OID4VP-draft18',
          interactionMethod: 'link'
        });

        expect(link).to.equal('openid4vp://?request_uri=https://example.com/request');
      });

      it('should return null for unsupported protocol', () => {
        const exchange = {
          protocols: {
            'OID4VP-1.0': 'openid4vp://?request_uri=https://example.com/request'
          },
          challenge: 'test-challenge'
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'cadmv-wallet',
          protocol: 'invalid-protocol',
          interactionMethod: 'qr'
        });

        expect(link).to.be(null);
      });

      it('should return null when protocol not in exchange', () => {
        const exchange = {
          protocols: {},
          challenge: 'test-challenge'
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'cadmv-wallet',
          protocol: 'OID4VP-1.0',
          interactionMethod: 'qr'
        });

        expect(link).to.be(null);
      });
    });

    describe('LCW', () => {
      it('should generate deep link for vcapi with qr', () => {
        const exchange = {
          protocols: {
            vcapi: 'https://example.com/exchanges/123'
          },
          challenge: 'test-challenge-123',
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'lcw',
          protocol: 'vcapi',
          interactionMethod: 'qr'
        });

        expect(link).to.contain('https://lcw.app/');
        expect(link).to.contain('request=');
        expect(link).to.contain(encodeURIComponent('https://example.com/exchanges/123'));
        expect(link).to.contain('issuer=');
        expect(link).to.contain(encodeURIComponent('did:web:example.com'));
        expect(link).to.contain('auth_type=bearer');
        expect(link).to.contain('challenge=');
        expect(link).to.contain(encodeURIComponent('test-challenge-123'));
      });

      it('should generate deep link for vcapi with link', () => {
        const exchange = {
          protocols: {
            vcapi: 'https://example.com/exchanges/456'
          },
          challenge: 'test-challenge-456',
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'lcw',
          protocol: 'vcapi',
          interactionMethod: 'link'
        });

        expect(link).to.contain('https://lcw.app/');
        expect(link).to.contain('request=');
        expect(link).to.contain(encodeURIComponent('https://example.com/exchanges/456'));
        expect(link).to.contain('issuer=');
        expect(link).to.contain(encodeURIComponent('did:web:example.com'));
        expect(link).to.contain('auth_type=bearer');
        expect(link).to.contain('challenge=');
        expect(link).to.contain(encodeURIComponent('test-challenge-456'));
      });

      it('should handle empty challenge', () => {
        const exchange = {
          protocols: {
            vcapi: 'https://example.com/exchanges/999'
          },
          challenge: ''
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'lcw',
          protocol: 'vcapi',
          interactionMethod: 'qr'
        });

        expect(link).to.contain('challenge=');
        expect(link).to.contain(encodeURIComponent(''));
      });

      it('should return null when vcapi not in exchange', () => {
        const exchange = {
          protocols: {},
          challenge: 'test-challenge'
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'lcw',
          protocol: 'vcapi',
          interactionMethod: 'qr'
        });

        expect(link).to.be(null);
      });
    });

    describe('Edge cases', () => {
      it('should return null for invalid wallet ID', () => {
        const exchange = {
          protocols: {
            'OID4VP-1.0': 'openid4vp://?request_uri=https://example.com/request'
          },
          challenge: 'test-challenge'
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'invalid-wallet',
          protocol: 'OID4VP-1.0',
          interactionMethod: 'qr'
        });

        expect(link).to.be(null);
      });

      it('should return null for unsupported interaction method', () => {
        const exchange = {
          protocols: {
            'OID4VP-1.0': 'openid4vp://?request_uri=https://example.com/request'
          },
          challenge: 'test-challenge'
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'cadmv-wallet',
          protocol: 'OID4VP-1.0',
          interactionMethod: 'dcapi'
        });

        expect(link).to.be(null);
      });

      it('should return null for null exchange', () => {
        const link = generateWalletLink({
          exchange: null,
          walletId: 'cadmv-wallet',
          protocol: 'OID4VP-1.0',
          interactionMethod: 'qr'
        });

        expect(link).to.be(null);
      });

      it('should return null for null wallet ID', () => {
        const exchange = {
          protocols: {
            'OID4VP-1.0': 'openid4vp://?request_uri=https://example.com/request'
          },
          challenge: 'test-challenge'
        };

        const link = generateWalletLink({
          exchange,
          walletId: null,
          protocol: 'OID4VP-1.0',
          interactionMethod: 'qr'
        });

        expect(link).to.be(null);
      });

      it('should return null for null protocol', () => {
        const exchange = {
          protocols: {
            'OID4VP-1.0': 'openid4vp://?request_uri=https://example.com/request'
          },
          challenge: 'test-challenge'
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'cadmv-wallet',
          protocol: null,
          interactionMethod: 'qr'
        });

        expect(link).to.be(null);
      });

      it('should return null for null interaction method', () => {
        const exchange = {
          protocols: {
            'OID4VP-1.0': 'openid4vp://?request_uri=https://example.com/request'
          },
          challenge: 'test-challenge'
        };

        const link = generateWalletLink({
          exchange,
          walletId: 'cadmv-wallet',
          protocol: 'OID4VP-1.0',
          interactionMethod: null
        });

        expect(link).to.be(null);
      });
    });
  });
});

