/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  buildIssuerTrustAnchorsPem,
  buildReaderCertChainPem
} from '../../../lib/workflows/profiles/native-spruceid-18013-7.js';
import expect from 'expect.js';

// Test certificates (structurally valid PEM, dummy content)
const SIGNING_CERT = `-----BEGIN CERTIFICATE-----
MIIBxTCCAWugAwIBAgIUTestSigningCert0001MAoGCCqGSM49BAMCMEUxCzAJBgNV
BAYTAlVTMQswCQYDVQQIDAJDQTESMBAGA1UEBwwJVGVzdENpdHkxFTATBgNVBAoM
DFRlc3RPcmdVbml0MTAeFw0yNjAxMDEwMDAwMDBaFw0zNjAxMDEwMDAwMDBaMEUx
CzAJBgNVBAYTAlVTMQswCQYDVQQIDAJDQTESMBAGA1UEBwwJVGVzdENpdHkxFTAT
BgNVBAoMDFRlc3RPcmdVbml0MTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABFak
-----END CERTIFICATE-----`;

const INTERMEDIATE_CERT = `-----BEGIN CERTIFICATE-----
MIIBxTCCAWugAwIBAgIUIntermediate001TestMAoGCCqGSM49BAMCMEUxCzAJBgN
VBAYTAlVTMQswCQYDVQQIDAJDQTESMBAGA1UEBwwJVGVzdENpdHkxFTATBgNVBAoM
DFRlc3RPcmdVbml0MTAeFw0yNjAxMDEwMDAwMDBaFw0zNjAxMDEwMDAwMDBaMEUx
CzAJBgNVBAYTAlVTMQswCQYDVQQIDAJDQTESMBAGA1UEBwwJVGVzdENpdHkxFTAT
BgNVBAoMDFRlc3RPcmdVbml0MTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABINTM
-----END CERTIFICATE-----`;

const IACA_ROOT_1 = `-----BEGIN CERTIFICATE-----
MIIBxTCCAWugAwIBAgIUIACARoot0001TestMAoGCCqGSM49BAMCMEUxCzAJBgNVBA
YTAlVTMQswCQYDVQQIDAJDQTESMBAGA1UEBwwJVGVzdENpdHkxFTATBgNVBAoMDF
Rlc3RPcmdVbml0MTAeFw0yNjAxMDEwMDAwMDBaFw0zNjAxMDEwMDAwMDBaMEUxCz
AJBgNVBAYTAlVTMQswCQYDVQQIDAJDQTESMBAGA1UEBwwJVGVzdENpdHkxFTATBg
NVBAoMDFRlc3RPcmdVbml0MTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABROOT1
-----END CERTIFICATE-----`;

const IACA_ROOT_2 = `-----BEGIN CERTIFICATE-----
MIIBxTCCAWugAwIBAgIUIACARoot0002TestMAoGCCqGSM49BAMCMEUxCzAJBgNVBA
YTAlVTMQswCQYDVQQIDAJDQTESMBAGA1UEBwwJVGVzdENpdHkxFTATBgNVBAoMDF
Rlc3RPcmdVbml0MTAeFw0yNjAxMDEwMDAwMDBaFw0zNjAxMDEwMDAwMDBaMEUxCz
AJBgNVBAYTAlVTMQswCQYDVQQIDAJDQTESMBAGA1UEBwwJVGVzdENpdHkxFTATBg
NVBAoMDFRlc3RPcmdVbml0MTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABROOT2
-----END CERTIFICATE-----`;

function countCertBlocks(pem) {
  return (pem.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
}

describe('buildReaderCertChainPem', () => {
  it('returns the normalized signing cert PEM unchanged for a single cert',
    () => {
      const result = buildReaderCertChainPem({signingCertPem: SIGNING_CERT});
      expect(countCertBlocks(result)).to.be(1);
      expect(result).to.contain('TestSigningCert0001');
      expect(result).to.match(/-----END CERTIFICATE-----\s*$/);
    });

  it('preserves multi-cert chains (leaf + intermediate)', () => {
    const chain = SIGNING_CERT + '\n' + INTERMEDIATE_CERT;
    const result = buildReaderCertChainPem({signingCertPem: chain});
    expect(countCertBlocks(result)).to.be(2);
    expect(result).to.contain('TestSigningCert0001');
    expect(result).to.contain('Intermediate001');
    expect(result.indexOf('TestSigningCert0001'))
      .to.be.lessThan(result.indexOf('Intermediate001'));
  });

  it('strips trailing whitespace after the END boundary', () => {
    const messy = SIGNING_CERT + '   \n\n  ';
    const result = buildReaderCertChainPem({signingCertPem: messy});
    expect(countCertBlocks(result)).to.be(1);
    expect(result).to.match(/-----END CERTIFICATE-----\s*$/);
    // No trailing junk past the last END boundary's newline.
    expect(result.endsWith(' ')).to.be(false);
  });
});

describe('buildIssuerTrustAnchorsPem', () => {
  it('concatenates each caStore entry as a separate PEM block', () => {
    const result = buildIssuerTrustAnchorsPem({
      caStoreCerts: [{pem: IACA_ROOT_1}, {pem: IACA_ROOT_2}]
    });
    expect(countCertBlocks(result)).to.be(2);
    expect(result).to.contain('IACARoot0001');
    expect(result).to.contain('IACARoot0002');
    expect(result.indexOf('IACARoot0001'))
      .to.be.lessThan(result.indexOf('IACARoot0002'));
  });

  it('accepts the runtime-flat shape (array of PEM strings)', () => {
    const result = buildIssuerTrustAnchorsPem({
      caStoreCerts: [IACA_ROOT_1, IACA_ROOT_2]
    });
    expect(countCertBlocks(result)).to.be(2);
  });

  it('accepts a mix of string and {pem} entries', () => {
    const result = buildIssuerTrustAnchorsPem({
      caStoreCerts: [IACA_ROOT_1, {pem: IACA_ROOT_2}]
    });
    expect(countCertBlocks(result)).to.be(2);
  });

  it('skips entries with no usable PEM', () => {
    const result = buildIssuerTrustAnchorsPem({
      caStoreCerts: [
        {pem: IACA_ROOT_1},
        {},
        {pem: null},
        {pem: IACA_ROOT_2}
      ]
    });
    expect(countCertBlocks(result)).to.be(2);
  });

  it('returns "" for empty caStore', () => {
    expect(buildIssuerTrustAnchorsPem({caStoreCerts: []})).to.be('');
  });

  it('returns "" when caStoreCerts is omitted entirely', () => {
    expect(buildIssuerTrustAnchorsPem()).to.be('');
  });

  it('does NOT include the signing cert', () => {
    const result = buildIssuerTrustAnchorsPem({
      caStoreCerts: [{pem: IACA_ROOT_1}]
    });
    expect(result).to.not.contain('TestSigningCert0001');
  });
});
