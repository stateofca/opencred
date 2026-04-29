/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  getWalletCertificatesByWallet,
  loadWalletCertEntry,
  parseCertificateChainPem,
  ReaderAuthConfigError
} from '../../../lib/workflows/common/wallet-certificates.js';
import {appleWalletTestEntry} from '../../fixtures/wallet-certificates.js';
import {config} from '@bedrock/core';
import expect from 'expect.js';

describe('wallet-certificates', () => {

  describe('ReaderAuthConfigError', () => {
    it('exposes statusCode 400 and READER_AUTH_CONFIG', () => {
      const err = new ReaderAuthConfigError('test');
      expect(err.statusCode).to.be(400);
      expect(err.errorCode).to.be('READER_AUTH_CONFIG');
      expect(err.name).to.be('ReaderAuthConfigError');
    });
  });

  describe('getWalletCertificatesByWallet', () => {
    it('filters by wallet in array order', () => {
      const prev = config.opencred;
      const a = {...appleWalletTestEntry, id: 'a'};
      const b = {
        ...appleWalletTestEntry,
        id: 'b',
        wallet: 'google-wallet'
      };
      try {
        config.opencred = {walletCertificates: [a, b]};
        const apple = getWalletCertificatesByWallet('apple-wallet');
        expect(apple.length).to.be(1);
        expect(apple[0].id).to.be('a');
        const google = getWalletCertificatesByWallet('google-wallet');
        expect(google.length).to.be(1);
        expect(google[0].id).to.be('b');
      } finally {
        config.opencred = prev;
      }
    });

    it('returns an empty array when walletCertificates is absent', () => {
      const prev = config.opencred;
      try {
        config.opencred = {};
        expect(getWalletCertificatesByWallet('apple-wallet')).to.eql([]);
      } finally {
        config.opencred = prev;
      }
    });
  });

  describe('parseCertificateChainPem', () => {
    it('returns leaf-first DER buffers', () => {
      const ders = parseCertificateChainPem(
        appleWalletTestEntry.certificatePem);
      expect(ders.length).to.be(1);
      expect(ders[0]).to.be.a(Uint8Array);
      expect(ders[0].length).to.be.greaterThan(0);
    });

    it('returns an empty array for PEM without blocks', () => {
      expect(parseCertificateChainPem('no certs here')).to.eql([]);
    });
  });

  describe('loadWalletCertEntry', () => {
    it('loads private key and derChain from fixture entry', async () => {
      const loaded = await loadWalletCertEntry(appleWalletTestEntry);
      expect(loaded.id).to.equal(appleWalletTestEntry.id);
      expect(loaded.wallet).to.equal('apple-wallet');
      expect(loaded.displayName).to.equal(appleWalletTestEntry.displayName);
      expect(loaded.privateKey).to.be.ok();
      expect(loaded.derChain.length).to.be(1);
    });

    it('throws when certificatePem has no blocks', async () => {
      try {
        await loadWalletCertEntry({
          ...appleWalletTestEntry,
          certificatePem: ''
        });
        expect().fail('expected error');
      } catch(e) {
        expect(e.message).to.contain('no PEM certificate blocks');
      }
    });
  });
});
