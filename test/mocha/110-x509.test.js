/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import asn1js from 'asn1js';
import {Crypto} from '@peculiar/webcrypto';
import fs from 'node:fs';
import pkijs from 'pkijs';

import {extractCertsFromX5C, verifyChain} from '../../common/x509.js';
import {config} from '@bedrock/core';
import expect from 'expect.js';
import {X509Certificate} from 'node:crypto';
const crypto = new Crypto();

function crlOk(crl) {
  const mockResponse = new Response(crl, {
    status: 200,
    headers: {
      'Content-type': 'application/pkix-crl'
    }
  });
  return Promise.resolve(mockResponse);
}

function createCRLExtension() {
  const crlUri = 'http://example.com/crl';

  // Create CRLDistributionPoints extension
  const crlDistributionPoints = new pkijs.CRLDistributionPoints({
    distributionPoints: [new pkijs.DistributionPoint({
      distributionPoint: [new pkijs.GeneralName({
        type: 6, // URI type
        value: crlUri
      })]
    })]
  });
  // Add the extension to the certificate
  return new pkijs.Extension({
    extnID: '2.5.29.31', // OID for CRL Distribution Points
    critical: false,
    extnValue: crlDistributionPoints.toSchema().toBER(false)
  });
}

async function createCRL(revoked, serialNumber, issuerKeys, issuerCert) {
  // Create a new CRL instance
  const crl = new pkijs.CertificateRevocationList();
  crl.version = 1;
  // Set the issuer name (from the issuer's certificate)
  crl.issuer.typesAndValues = issuerCert.subject.typesAndValues;

  crl.crlExtensions = new pkijs.Extensions({
    extensions: [
      new pkijs.Extension({
        extnID: '2.5.29.20', // OID for crlNumber
        critical: false,
        extnValue: (new asn1js.Integer({value: 5})).toBER(false)
      })
    ]
  });

  // Set the update times (current time and next update)
  crl.thisUpdate.value = new Date();
  crl.nextUpdate = new pkijs.Time({
    type: 0, value: new Date(new Date().getTime() + 1000000)
  });
  if(revoked) {
    // Add revoked certificates (example)
    crl.revokedCertificates = [new pkijs.RevokedCertificate({
      userCertificate: serialNumber,
      revocationDate: new pkijs.Time({type: 0, value: new Date()})
    })];
  }
  await crl.sign(issuerKeys.privateKey, 'SHA-256');
  return crl.toSchema(true).toBER(false);
}

function createKeyUsageExtension(usage) {
  const bitArray = new ArrayBuffer(1);
  const bitView = new Uint8Array(bitArray);
  if(usage.digitalSignature) {
    bitView[0] |= 0x80;
  } // Bit 0
  if(usage.nonRepudiation) {
    bitView[0] |= 0x40;
  } // Bit 1
  if(usage.keyEncipherment) {
    bitView[0] |= 0x20;
  } // Bit 2
  if(usage.dataEncipherment) {
    bitView[0] |= 0x10;
  } // Bit 3
  if(usage.keyAgreement) {
    bitView[0] |= 0x08;
  } // Bit 4
  if(usage.keyCertSign) {
    bitView[0] |= 0x04;
  } // Bit 5
  if(usage.cRLSign) {
    bitView[0] |= 0x02;
  } // Bit 6

  const keyUsageValue = new asn1js.BitString({valueHex: bitArray});
  return new pkijs.Extension({
    extnID: '2.5.29.15', // OID for Key Usage
    critical: true,
    extnValue: keyUsageValue.toBER(false),
    parsedValue: keyUsageValue // Parsed value for well-known extensions
  });
}

async function generateRSAKeyPair() {

  const algorithm =
    pkijs.getAlgorithmParameters('RSASSA-PKCS1-v1_5', 'generateKey');
  if('hash' in algorithm.algorithm) {
    algorithm.algorithm.hash.name = 'SHA-256';
  }

  const {publicKey, privateKey} = await crypto.subtle.generateKey(
    algorithm.algorithm, true, algorithm.usages
  );

  return {publicKey, privateKey};
}

const createAttributes = i => {
  const items = [];
  items.push(new pkijs.AttributeTypeAndValue({
    type: '2.5.4.3',
    value: new asn1js.BmpString({value: `Entity ${i}`})
  }));
  items.push(new pkijs.AttributeTypeAndValue({
    type: '2.5.4.6',
    value: new asn1js.BmpString({value: `US`})
  }));
  items.push(new pkijs.AttributeTypeAndValue({
    type: '2.5.4.8',
    value: new asn1js.BmpString({value: `California`})
  }));
  items.push(new pkijs.AttributeTypeAndValue({
    type: '2.5.4.7',
    value: new asn1js.BmpString({value: `Los Angeles`})
  }));
  items.push(new pkijs.AttributeTypeAndValue({
    type: '2.5.4.10',
    value: new asn1js.BmpString({value: `Entity ${i} LLC`})
  }));
  items.push(new pkijs.AttributeTypeAndValue({
    type: '2.5.4.11',
    value: new asn1js.BmpString({value: `Entity ${i}`})
  }));
  return items;
};

async function generateCertificateChain(
  n, crlEnabled = false, revoked = false
) {
  pkijs.setEngine('newEngine', crypto, new pkijs.CryptoEngine({
    name: '', crypto, subtle: crypto.subtle
  }));
  let chain = [];
  let certIssuer;
  let keysIssuer;
  let crl;
  for(let i = 0; i < n; i++) {
    if(!certIssuer) {
      keysIssuer = await generateRSAKeyPair();
      certIssuer = new pkijs.Certificate();
      certIssuer.version = 2;
      certIssuer.publicKey = keysIssuer.publicKey;
      certIssuer.serialNumber = new asn1js.Integer({value: i});

      // set the validity range (from now to +1 year)
      const now = new Date();
      certIssuer.notBefore.value = now;
      certIssuer.notAfter.value = new Date(
        now.getFullYear() + 1, now.getMonth(), now.getDate());

      certIssuer.issuer.typesAndValues.push(...createAttributes(i));
      certIssuer.subject.typesAndValues.push(...createAttributes(i));

      // set appropriate extensions
      const basicConstraintsExt = new pkijs.Extension({
        extnID: '2.5.29.19', // OID for Basic Constraints
        critical: true, // Usually set as critical
        extnValue: new pkijs.BasicConstraints({
          cA: true,
          pathLenConstraint: 3
        }).toSchema().toBER(false)
      });
      const keyUsageExt = createKeyUsageExtension({
        digitalSignature: true, // bit 0
        nonRepudiation: true, // bit 1
        keyEncipherment: false, // bit 2
        dataEncipherment: false, // bit 3
        keyAgreement: false, // bit 4
        keyCertSign: true, // bit 5
        cRLSign: false, // bit 6
      });

      certIssuer.extensions = [];
      certIssuer.extensions.push(basicConstraintsExt);
      certIssuer.extensions.push(keyUsageExt);

      // self-sign the certificate
      await certIssuer.subjectPublicKeyInfo.importKey(keysIssuer.publicKey);
      await certIssuer.sign(keysIssuer.privateKey, 'SHA-256');

      chain = [new X509Certificate(Buffer.from(certIssuer.toSchema().toBER()))];
      continue;
    }

    // generate a keypair and create an X.509v3 certificate
    const keysSubject = await generateRSAKeyPair();
    const certSubject = new pkijs.Certificate();
    certSubject.version = 2;
    certSubject.publicKey = keysIssuer.publicKey;
    certSubject.serialNumber = new asn1js.Integer({value: i});

    // set the validity range (from now to +1 year)
    const now = new Date();
    certSubject.notBefore.value = now;
    certSubject.notAfter.value = new Date(
      now.getFullYear() + 1, now.getMonth(), now.getDate());

    // set the certificate fields
    certSubject.issuer.typesAndValues.push(...createAttributes(i - 1));
    certSubject.subject.typesAndValues.push(...createAttributes(i));

    // set appropriate extensions
    const basicConstraintsExt = new pkijs.Extension({
      extnID: '2.5.29.19', // OID for Basic Constraints
      critical: true, // Usually set as critical
      extnValue: new pkijs.BasicConstraints({
        cA: i < n - 1
      }).toSchema().toBER(false)
    });
    const keyUsageExt = createKeyUsageExtension({
      digitalSignature: true, // bit 0
      nonRepudiation: true, // bit 1
      keyEncipherment: false, // bit 2
      dataEncipherment: false, // bit 3
      keyAgreement: false, // bit 4
      keyCertSign: true, // bit 5
      cRLSign: i < n - 1 // bit 6
    });

    certSubject.extensions = [];
    certSubject.extensions.push(basicConstraintsExt);
    certSubject.extensions.push(keyUsageExt);

    if(i === n - 1 && crlEnabled) {
      const ext = createCRLExtension();
      crl = await createCRL(
        revoked, new asn1js.Integer({value: i}), keysIssuer,
        certIssuer
      );
      certSubject.extensions.push(ext);
    }

    // sign the certificate with issuer keys
    await certSubject.subjectPublicKeyInfo.importKey(keysSubject.publicKey);
    await certSubject.sign(keysIssuer.privateKey, 'SHA-256');

    // set issuer keys
    keysIssuer = keysSubject;
    certIssuer = certSubject;

    chain = [
      new X509Certificate(Buffer.from(certSubject.toSchema().toBER())),
      ...chain
    ];
  }
  return {chain, crl};
}

describe('x509', async () => {
  it('should verify valid certificate chain', async () => {
    const {chain} = await generateCertificateChain(3);
    const root = chain.pop();
    const configStub = sinon.stub(config.opencred, 'caStore').value([root.raw]);

    const verifiedChain = await verifyChain(chain);

    configStub.restore();
    verifiedChain.errors.length.should.be.equal(0);
    verifiedChain.verified.should.be.equal(true);
  });

  it('should fail to verify with revocation of OCSP', async () => {
    const rootFile = fs.readFileSync('./test/fixtures/revoked-cert/root.cer');
    const intFile = fs
      .readFileSync('./test/fixtures/revoked-cert/intermediate.cer');
    const intCert = new X509Certificate(intFile);
    const leafFile = fs.readFileSync('./test/fixtures/revoked-cert/leaf.cer');
    const leafCert = new X509Certificate(leafFile);
    const configStub = sinon.stub(config.opencred, 'caStore').value([rootFile]);
    const leafValidToStub = sinon.stub(leafCert, 'validTo')
      .value('Apr 12 23:59:59 2055 GMT');
    const intValidToStub = sinon.stub(intCert, 'validTo')
      .value('Apr 12 23:59:59 2055 GMT');

    const verifiedCert = await verifyChain([leafCert, intCert]);

    configStub.restore();
    leafValidToStub.restore();
    intValidToStub.restore();
    expect(verifiedCert.verified).to.be(false);
  });

  it.skip('should fail to verify with CRL URI status 404', async () => {
    const {chain} = await generateCertificateChain(3, true);
    const root = chain.pop();
    const configStub = sinon.stub(config.opencred, 'caStore').value([root.raw]);

    const verifiedChain = await verifyChain(chain);

    configStub.restore();
    verifiedChain.errors[0].should.be.equal(
      'Failed to query CRL at http://example.com/crl - Received 404');
    expect(verifiedChain.verified).to.be(false);
  });

  it.skip('should fail to verify with CRL revoked entry', async () => {
    const {chain, crl} = await generateCertificateChain(3, true, true);
    const root = chain.pop();
    const configStub = sinon.stub(config.opencred, 'caStore').value([root.raw]);
    const fetchStub = sinon.stub(global, 'fetch').resolves(crlOk(crl));

    const verifiedChain = await verifyChain(chain);

    configStub.restore();
    fetchStub.restore();
    verifiedChain.errors.length.should.be.equal(1);
    verifiedChain.errors[0].should.be.equal(
      'x509 certificate has been revoked (CRL)'
    );
    expect(verifiedChain.verified).to.be(false);
  });

  it('should verify with valid CRL entry', async () => {
    const {chain, crl} = await generateCertificateChain(3, true, false);
    const root = chain.pop();
    const fetchStub = sinon.stub(global, 'fetch').resolves(crlOk(crl));
    const configStub = sinon.stub(config.opencred, 'caStore').value([root.raw]);

    const verifiedChain = await verifyChain(chain);

    configStub.restore();
    fetchStub.restore();
    verifiedChain.errors.length.should.be.equal(0);
    verifiedChain.verified.should.be.equal(true);
  });

  it('should fail to verify invalid test cert', async () => {
    const cert = fs.readFileSync('./test/fixtures/expired.badssl.com.cer');
    const verifiedCert = await verifyChain(
      [new X509Certificate(cert)]
    );
    expect(verifiedCert.verified).to.be(false);
  });

  it('should handle JWK x5c as DER', async () => {
    const certs = await extractCertsFromX5C({
      kty: 'RSA',
      n: 'vrjOfz9Ccdgx5nQudyhdoR17V-IubWMeOZCwX_jj0hgAsz2J_pqYW08PLbK_PdiVGK' +
        'PrqzmDIsLI7sA25VEnHU1uCLNwBuUiCO11_-7dYbsr4iJmG0Qu2j8DsVyT1azpJC_NG' +
        '84Ty5KKthuCaPod7iI7w0LK9orSMhBEwwZDCxTWq4aYWAchc8t-emd9qOvWtVMDC2BX' +
        'ksRngh6X5bUYLy6AyHKvj-nUy1wgzjYQDwHMTplCoLtU-o-8SNnZ1tmRoGE9uJkBLdh' +
        '5gFENabWnU5m1ZqZPdwS-qo-meMvVfJb6jJVWRpl2SUtCnYG2C32qvbWbjZ_jBPD5eu' +
        'nqsIo1vQ',
      e: 'AQAB',
      x5c: [`MIIDQjCCAiqgAwIBAgIGATz/FuLiMA0GCSqGSIb3DQEBBQUAMGIxCzAJB` +
            `gNVBAYTAlVTMQswCQYDVQQIEwJDTzEPMA0GA1UEBxMGRGVudmVyMRwwGgYD` +
            `VQQKExNQaW5nIElkZW50aXR5IENvcnAuMRcwFQYDVQQDEw5CcmlhbiBDYW1` +
            `wYmVsbDAeFw0xMzAyMjEyMzI5MTVaFw0xODA4MTQyMjI5MTVaMGIxCzAJBg` +
            `NVBAYTAlVTMQswCQYDVQQIEwJDTzEPMA0GA1UEBxMGRGVudmVyMRwwGgYDV` +
            `QQKExNQaW5nIElkZW50aXR5IENvcnAuMRcwFQYDVQQDEw5CcmlhbiBDYW1w` +
            `YmVsbDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAL64zn8/QnH` +
            `YMeZ0LncoXaEde1fiLm1jHjmQsF/449IYALM9if6amFtPDy2yvz3YlRij66` +
            `s5gyLCyO7ANuVRJx1NbgizcAblIgjtdf/u3WG7K+IiZhtELto/A7Fck9Ws6` +
            `SQvzRvOE8uSirYbgmj6He4iO8NCyvaK0jIQRMMGQwsU1quGmFgHIXPLfnpn` +
            `fajr1rVTAwtgV5LEZ4Iel+W1GC8ugMhyr4/p1MtcIM42EA8BzE6ZQqC7VPq` +
            `PvEjZ2dbZkaBhPbiZAS3YeYBRDWm1p1OZtWamT3cEvqqPpnjL1XyW+oyVVk` +
            `aZdklLQp2Btgt9qr21m42f4wTw+Xrp6rCKNb0CAwEAATANBgkqhkiG9w0BA` +
            `QUFAAOCAQEAh8zGlfSlcI0o3rYDPBB07aXNswb4ECNIKG0CETTUxmXl9KUL` +
            `+9gGlqCz5iWLOgWsnrcKcY0vXPG9J1r9AqBNTqNgHq2G03X09266X5CpOe1` +
            `zFo+Owb1zxtp3PehFdfQJ610CDLEaS9V9Rqp17hCyybEpOGVwe8fnk+fbEL` +
            `2Bo3UPGrpsHzUoaGpDftmWssZkhpBJKVMJyf/RuP2SmmaIzmnw9JiSlYhzo` +
            `4tpzd5rFXhjRbg4zW9C+2qok+2+qDM1iJ684gPHMIY8aLWrdgQTxkumGmTq` +
            `gawR+N5MDtdPTEQ0XfIBc2cJEUyMTY5MPvACWpkA6SdS4xSvdXK3IVfOWA==`
      ]});
    certs.length.should.be.equal(1);
  });

  it('should handle JWK x5c as base64 PEM', async () => {
    const certs = await extractCertsFromX5C({
      kty: 'RSA',
      n: 'vrjOfz9Ccdgx5nQudyhdoR17V-IubWMeOZCwX_jj0hgAsz2J_pqYW08PLbK_PdiVGK' +
        'PrqzmDIsLI7sA25VEnHU1uCLNwBuUiCO11_-7dYbsr4iJmG0Qu2j8DsVyT1azpJC_NG' +
        '84Ty5KKthuCaPod7iI7w0LK9orSMhBEwwZDCxTWq4aYWAchc8t-emd9qOvWtVMDC2BX' +
        'ksRngh6X5bUYLy6AyHKvj-nUy1wgzjYQDwHMTplCoLtU-o-8SNnZ1tmRoGE9uJkBLdh' +
        '5gFENabWnU5m1ZqZPdwS-qo-meMvVfJb6jJVWRpl2SUtCnYG2C32qvbWbjZ_jBPD5eu' +
        'nqsIo1vQ',
      e: 'AQAB',
      x5c: [
        `LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSURRakNDQWlxZ0F3SUJBZ0lHQV` +
        `R6L0Z1TGlNQTBHQ1NxR1NJYjNEUUVCQlFVQU1HSXhDekFKQgpnTlZCQVlUQWxWVE1R` +
        `c3dDUVlEVlFRSUV3SkRUekVQTUEwR0ExVUVCeE1HUkdWdWRtVnlNUnd3R2dZRApWUV` +
        `FLRXhOUWFXNW5JRWxrWlc1MGFYUjVJRU52Y25BdU1SY3dGUVlEVlFRREV3NUNjbWxo` +
        `YmlCRFlXMQp3WW1Wc2JEQWVGdzB4TXpBeU1qRXlNekk1TVRWYUZ3MHhPREE0TVRReU` +
        `1qSTVNVFZhTUdJeEN6QUpCZwpOVkJBWVRBbFZUTVFzd0NRWURWUVFJRXdKRFR6RVBN` +
        `QTBHQTFVRUJ4TUdSR1Z1ZG1WeU1Sd3dHZ1lEVgpRUUtFeE5RYVc1bklFbGtaVzUwYV` +
        `hSNUlFTnZjbkF1TVJjd0ZRWURWUVFERXc1Q2NtbGhiaUJEWVcxdwpZbVZzYkRDQ0FT` +
        `SXdEUVlKS29aSWh2Y05BUUVCQlFBRGdnRVBBRENDQVFvQ2dnRUJBTDY0em44L1FuSA` +
        `pZTWVaMExuY29YYUVkZTFmaUxtMWpIam1Rc0YvNDQ5SVlBTE05aWY2YW1GdFBEeTJ5` +
        `dnozWWxSaWo2NgpzNWd5TEN5TzdBTnVWUkp4MU5iZ2l6Y0FibElnanRkZi91M1dHN0` +
        `srSWlaaHRFTHRvL0E3RmNrOVdzNgpTUXZ6UnZPRTh1U2lyWWJnbWo2SGU0aU84TkN5` +
        `dmFLMGpJUVJNTUdRd3NVMXF1R21GZ0hJWFBMZm5wbgpmYWpyMXJWVEF3dGdWNUxFWj` +
        `RJZWwrVzFHQzh1Z01oeXI0L3AxTXRjSU00MkVBOEJ6RTZaUXFDN1ZQcQpQdkVqWjJk` +
        `YlprYUJoUGJpWkFTM1llWUJSRFdtMXAxT1p0V2FtVDNjRXZxcVBwbmpMMVh5VytveV` +
        `ZWawphWmRrbExRcDJCdGd0OXFyMjFtNDJmNHdUdytYcnA2ckNLTmIwQ0F3RUFBVEFO` +
        `QmdrcWhraUc5dzBCQQpRVUZBQU9DQVFFQWg4ekdsZlNsY0kwbzNyWURQQkIwN2FYTn` +
        `N3YjRFQ05JS0cwQ0VUVFV4bVhsOUtVTAorOWdHbHFDejVpV0xPZ1dzbnJjS2NZMHZY` +
        `UEc5SjFyOUFxQk5UcU5nSHEyRzAzWDA5MjY2WDVDcE9lMQp6Rm8rT3diMXp4dHAzUG` +
        `VoRmRmUUo2MTBDRExFYVM5VjlScXAxN2hDeXliRXBPR1Z3ZThmbmsrZmJFTAoyQm8z` +
        `VVBHcnBzSHpVb2FHcERmdG1Xc3Naa2hwQkpLVk1KeWYvUnVQMlNtbWFJem1udzlKaV` +
        `NsWWh6bwo0dHB6ZDVyRlhoalJiZzR6VzlDKzJxb2srMitxRE0xaUo2ODRnUEhNSVk4` +
        `YUxXcmRnUVR4a3VtR21UcQpnYXdSK041TUR0ZFBURVEwWGZJQmMyY0pFVXlNVFk1TV` +
        `B2QUNXcGtBNlNkUzR4U3ZkWEszSVZmT1dBPT0KLS0tLS1FTkQgQ0VSVElGSUNBVEUt` +
        `LS0tLQ==`
      ]});

    certs.length.should.be.equal(1);
  });

  it('should not handle JWK x5c as anything else', async () => {
    const certs = await extractCertsFromX5C({
      kty: 'RSA',
      n: 'vrjOfz9Ccdgx5nQudyhdoR17V-IubWMeOZCwX_jj0hgAsz2J_pqYW08PLbK_PdiVGK' +
        'PrqzmDIsLI7sA25VEnHU1uCLNwBuUiCO11_-7dYbsr4iJmG0Qu2j8DsVyT1azpJC_NG' +
        '84Ty5KKthuCaPod7iI7w0LK9orSMhBEwwZDCxTWq4aYWAchc8t-emd9qOvWtVMDC2BX' +
        'ksRngh6X5bUYLy6AyHKvj-nUy1wgzjYQDwHMTplCoLtU-o-8SNnZ1tmRoGE9uJkBLdh' +
        '5gFENabWnU5m1ZqZPdwS-qo-meMvVfJb6jJVWRpl2SUtCnYG2C32qvbWbjZ_jBPD5eu' +
        'nqsIo1vQ',
      e: 'AQAB',
      x5c: [
        `NOT A VALID CERT`
      ]});

    should.not.exist(certs);
  });
});
