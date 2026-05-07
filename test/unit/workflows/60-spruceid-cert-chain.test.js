/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {buildCertChainPem} from
  '../../../lib/workflows/profiles/native-spruceid-18013-7.js';
import expect from 'expect.js';

// Test certificates (structurally valid PEM, dummy content)
const SIGNING_CERT = `-----BEGIN CERTIFICATE-----
MIIBxTCCAWugAwIBAgIUTestSigningCert0001MAoGCCqGSM49BAMCMEUxCzAJBgNV
BAYTAlVTMQswCQYDVQQIDAJDQTESMBAGA1UEBwwJVGVzdENpdHkxFTATBgNVBAoM
DFRlc3RPcmdVbml0MTAeFw0yNjAxMDEwMDAwMDBaFw0zNjAxMDEwMDAwMDBaMEUx
CzAJBgNVBAYTAlVTMQswCQYDVQQIDAJDQTESMBAGA1UEBwwJVGVzdENpdHkxFTAT
BgNVBAoMDFRlc3RPcmdVbml0MTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABFak
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

describe('buildCertChainPem', () => {
  it('should concatenate signing cert with caStore certs', () => {
    const result = buildCertChainPem({
      signingCertPem: SIGNING_CERT,
      caStoreCerts: [
        {pem: IACA_ROOT_1},
        {pem: IACA_ROOT_2}
      ]
    });

    // Result should contain all three certificates
    const certCount = (result.match(/-----BEGIN CERTIFICATE-----/g) || [])
      .length;
    expect(certCount).to.be(3);

    // Signing cert should come first
    const signingIndex = result.indexOf('TestSigningCert0001');
    const root1Index = result.indexOf('IACARoot0001');
    const root2Index = result.indexOf('IACARoot0002');

    expect(signingIndex).to.be.greaterThan(-1);
    expect(root1Index).to.be.greaterThan(-1);
    expect(root2Index).to.be.greaterThan(-1);

    // Signing cert before IACA roots
    expect(signingIndex).to.be.lessThan(root1Index);
    expect(root1Index).to.be.lessThan(root2Index);
  });

  it('should work with empty caStore', () => {
    const result = buildCertChainPem({
      signingCertPem: SIGNING_CERT,
      caStoreCerts: []
    });

    const certCount = (result.match(/-----BEGIN CERTIFICATE-----/g) || [])
      .length;
    expect(certCount).to.be(1);
    expect(result).to.contain('TestSigningCert0001');
  });

  it('should work when caStoreCerts is undefined', () => {
    const result = buildCertChainPem({
      signingCertPem: SIGNING_CERT
    });

    const certCount = (result.match(/-----BEGIN CERTIFICATE-----/g) || [])
      .length;
    expect(certCount).to.be(1);
  });

  it('should skip caStore entries with no pem property', () => {
    const result = buildCertChainPem({
      signingCertPem: SIGNING_CERT,
      caStoreCerts: [
        {pem: IACA_ROOT_1},
        {},
        {pem: null},
        {pem: IACA_ROOT_2}
      ]
    });

    const certCount = (result.match(/-----BEGIN CERTIFICATE-----/g) || [])
      .length;
    expect(certCount).to.be(3);
  });

  it('should handle signing cert with trailing whitespace', () => {
    const messyCert = SIGNING_CERT + '   \n\n  ';
    const result = buildCertChainPem({
      signingCertPem: messyCert,
      caStoreCerts: [{pem: IACA_ROOT_1}]
    });

    const certCount = (result.match(/-----BEGIN CERTIFICATE-----/g) || [])
      .length;
    expect(certCount).to.be(2);
  });

  it(
    'normalizes signingCertPem with normalizePem (first PEM block only)',
    () => {
      const multiCertChain = SIGNING_CERT + '\n' + IACA_ROOT_1;
      const result = buildCertChainPem({
        signingCertPem: multiCertChain,
        caStoreCerts: [{pem: IACA_ROOT_2}]
      });

      const certCount = (result.match(/-----BEGIN CERTIFICATE-----/g) || [])
        .length;
      expect(certCount).to.be(2);
      expect(result).to.contain('TestSigningCert0001');
      expect(result).to.contain('IACARoot0002');
      expect(result).not.to.contain('IACARoot0001');
    }
  );

  it('should work with caStore as array of strings', () => {
    const result = buildCertChainPem({
      signingCertPem: SIGNING_CERT,
      caStoreCerts: [IACA_ROOT_1, IACA_ROOT_2]
    });

    const certCount = (result.match(/-----BEGIN CERTIFICATE-----/g) || [])
      .length;
    expect(certCount).to.be(3);

    const signingIndex = result.indexOf('TestSigningCert0001');
    const root1Index = result.indexOf('IACARoot0001');
    const root2Index = result.indexOf('IACARoot0002');

    expect(signingIndex).to.be.greaterThan(-1);
    expect(root1Index).to.be.greaterThan(-1);
    expect(root2Index).to.be.greaterThan(-1);
    expect(signingIndex).to.be.lessThan(root1Index);
    expect(root1Index).to.be.lessThan(root2Index);
  });

  it('should handle mixed caStore formats (strings and objects)', () => {
    const result = buildCertChainPem({
      signingCertPem: SIGNING_CERT,
      caStoreCerts: [
        IACA_ROOT_1, // string format
        {pem: IACA_ROOT_2} // object format
      ]
    });

    const certCount = (result.match(/-----BEGIN CERTIFICATE-----/g) || [])
      .length;
    expect(certCount).to.be(3);

    const signingIndex = result.indexOf('TestSigningCert0001');
    const root1Index = result.indexOf('IACARoot0001');
    const root2Index = result.indexOf('IACARoot0002');

    expect(signingIndex).to.be.greaterThan(-1);
    expect(root1Index).to.be.greaterThan(-1);
    expect(root2Index).to.be.greaterThan(-1);
    expect(signingIndex).to.be.lessThan(root1Index);
    expect(root1Index).to.be.lessThan(root2Index);
  });
});
