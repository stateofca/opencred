/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  SubjectAlternativeNameExtension,
  X509CertificateGenerator
} from '@peculiar/x509';
import {Crypto} from '@peculiar/webcrypto';
import expect from 'expect.js';

import {appleWalletTestEntry} from '../../fixtures/wallet-certificates.js';
import {validateWalletCertificates} from
  '../../../lib/workflows/common/wallet-cert-sanity.js';

const webcrypto = new Crypto();
const signingAlgorithm = {
  name: 'ECDSA',
  namedCurve: 'P-256',
  hash: 'SHA-256'
};

/**
 * @param {object} options - Options object.
 * @param {string[]} [options.sanHosts] - SAN DNS names for the leaf.
 * @param {Date} [options.notBefore] - Validity start.
 * @param {Date} [options.notAfter] - Validity end.
 * @returns {Promise<string>} PEM-encoded self-signed leaf certificate.
 */
async function mintLeafPem({sanHosts = [], notBefore, notAfter} = {}) {
  const keys = await webcrypto.subtle.generateKey(
    signingAlgorithm, false, ['sign', 'verify']);
  const now = new Date();
  const cert = await X509CertificateGenerator.createSelfSigned({
    name: 'CN=wallet-cert-sanity-test, O=OpenCred Test',
    notBefore: notBefore ?? now,
    notAfter: notAfter ?? new Date(
      now.getFullYear() + 1, now.getMonth(), now.getDate()),
    signingAlgorithm,
    keys,
    extensions: sanHosts.length > 0 ? [
      new SubjectAlternativeNameExtension(
        sanHosts.map(value => ({type: 'dns', value}))
      )
    ] : []
  }, webcrypto);
  return cert.toString('pem');
}

describe('wallet-cert-sanity', () => {
  describe('validateWalletCertificates', () => {
    it('returns ok=true and empty results for empty entries list', () => {
      const {ok, results} = validateWalletCertificates({
        entries: [],
        baseUri: 'https://example.com'
      });
      expect(ok).to.be(true);
      expect(results).to.eql([]);
    });

    it('returns ok=true and empty results for null entries', () => {
      const {ok, results} = validateWalletCertificates({
        entries: null,
        baseUri: 'https://example.com'
      });
      expect(ok).to.be(true);
      expect(results).to.eql([]);
    });

    it('returns ok=true with subject/issuer/SAN/validity for a ' +
      'well-formed entry whose SAN matches the baseUri host',
    async () => {
      const host = 'opencred-test.local';
      const certificatePem = await mintLeafPem({sanHosts: [host]});
      const entry = {...appleWalletTestEntry, certificatePem};
      const {ok, results} = validateWalletCertificates({
        entries: [entry],
        baseUri: `https://${host}`
      });
      expect(ok).to.be(true);
      expect(results.length).to.be(1);
      const r = results[0];
      expect(r.id).to.equal(entry.id);
      expect(r.wallet).to.equal(entry.wallet);
      expect(r.subjectCN).to.equal('wallet-cert-sanity-test');
      expect(r.issuerCN).to.equal('wallet-cert-sanity-test');
      expect(r.sanDnsNames).to.eql([host]);
      expect(r.notBefore).to.be.a(Date);
      expect(r.notAfter).to.be.a(Date);
      expect(r.baseUriMatch).to.be(true);
      expect(r.warnings).to.eql([]);
    });

    it('warns when SAN does not include the baseUri host', async () => {
      const certificatePem = await mintLeafPem({
        sanHosts: ['other.example.com']
      });
      const {ok, results} = validateWalletCertificates({
        entries: [{...appleWalletTestEntry, certificatePem}],
        baseUri: 'https://example.com'
      });
      expect(ok).to.be(false);
      expect(results[0].baseUriMatch).to.be(false);
      expect(results[0].warnings.some(w =>
        w.includes('leaf SAN DNS names do not include example.com'))).
        to.be(true);
    });

    it('warns when the leaf is expired', async () => {
      const now = new Date();
      const certificatePem = await mintLeafPem({
        sanHosts: ['example.com'],
        notBefore: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
        notAfter: new Date(now.getTime() - 24 * 60 * 60 * 1000)
      });
      const {ok, results} = validateWalletCertificates({
        entries: [{...appleWalletTestEntry, certificatePem}],
        baseUri: 'https://example.com'
      });
      expect(ok).to.be(false);
      expect(results[0].warnings).to.contain('leaf certificate is expired');
    });

    it('warns when the leaf expires within 30 days', async () => {
      const now = new Date();
      const certificatePem = await mintLeafPem({
        sanHosts: ['example.com'],
        notBefore: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        notAfter: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
      });
      const {ok, results} = validateWalletCertificates({
        entries: [{...appleWalletTestEntry, certificatePem}],
        baseUri: 'https://example.com'
      });
      expect(ok).to.be(false);
      expect(results[0].warnings).to.contain(
        'leaf certificate expires within 30 days');
    });

    it('warns when certificatePem yields zero PEM blocks', () => {
      const {ok, results} = validateWalletCertificates({
        entries: [{
          ...appleWalletTestEntry,
          certificatePem: 'no certs here'
        }],
        baseUri: 'https://example.com'
      });
      expect(ok).to.be(false);
      expect(results[0].warnings).to.contain(
        'no parseable PEM blocks in certificatePem');
      expect(results[0].subjectCN).to.be(null);
      expect(results[0].sanDnsNames).to.eql([]);
    });

    it('warns when X509 parsing throws (malformed DER)', () => {
      const {ok, results} = validateWalletCertificates({
        entries: [{
          ...appleWalletTestEntry,
          certificatePem:
            '-----BEGIN CERTIFICATE-----\nnot-valid-DER\n' +
            '-----END CERTIFICATE-----'
        }],
        baseUri: 'https://example.com'
      });
      expect(ok).to.be(false);
      expect(results[0].warnings.some(w =>
        w.includes('failed to parse leaf certificate'))).to.be(true);
    });

    it('case-insensitive SAN matching', async () => {
      const certificatePem = await mintLeafPem({sanHosts: ['Example.COM']});
      const {ok, results} = validateWalletCertificates({
        entries: [{...appleWalletTestEntry, certificatePem}],
        baseUri: 'https://example.com'
      });
      expect(ok).to.be(true);
      expect(results[0].baseUriMatch).to.be(true);
      expect(results[0].sanDnsNames).to.eql(['example.com']);
    });

    it('handles baseUri with trailing slash / port / path', async () => {
      const certificatePem = await mintLeafPem({
        sanHosts: ['veryimportant.example.com']
      });
      const {ok, results} = validateWalletCertificates({
        entries: [{...appleWalletTestEntry, certificatePem}],
        baseUri: 'https://VERYIMPORTANT.Example.com:8443/path/'
      });
      expect(ok).to.be(true);
      expect(results[0].baseUriMatch).to.be(true);
    });
  });
});
