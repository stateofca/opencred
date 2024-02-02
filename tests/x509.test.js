import * as sinon from 'sinon';
import {after, before, describe, it} from 'mocha';
import asn1js from 'asn1js';
import assert from 'node:assert';
import {Crypto} from '@peculiar/webcrypto';
import fs from 'node:fs';
import pkijs from 'pkijs';

import {config} from '../configs/config.js';
import expect from 'expect.js';
import {verifyX509} from '../common/x509.js';
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
  let originalErrorLog;

  before(() => {
    originalErrorLog = console.error;
    console.error = () => {};
  });

  after(() => {
    console.error = originalErrorLog;
  });

  it('should verify valid certificate chain', async () => {
    const {chain} = await generateCertificateChain(3);
    const root = chain.pop();
    const configStub = sinon.stub(config, 'caStore').value([root.raw]);

    const verifiedChain = await verifyX509(chain);

    configStub.restore();
    assert.deepEqual(verifiedChain.errors, []);
    assert.ok(verifiedChain.verified);
  });

  it('should fail to verify with revocation of OCSP', async () => {
    const rootFile = fs.readFileSync('./tests/fixtures/revoked-cert/root.cer');
    const intFile = fs
      .readFileSync('./tests/fixtures/revoked-cert/intermediate.cer');
    const intCert = new X509Certificate(intFile);
    const leafFile = fs.readFileSync('./tests/fixtures/revoked-cert/leaf.cer');
    const leafCert = new X509Certificate(leafFile);
    const configStub = sinon.stub(config, 'caStore').value([rootFile]);
    const leafValidToStub = sinon.stub(leafCert, 'validTo')
      .value('Apr 12 23:59:59 2055 GMT');
    const intValidToStub = sinon.stub(intCert, 'validTo')
      .value('Apr 12 23:59:59 2055 GMT');

    const verifiedCert = await verifyX509([leafCert, intCert]);

    configStub.restore();
    leafValidToStub.restore();
    intValidToStub.restore();
    expect(verifiedCert.verified).to.be(false);
  });

  it('should fail to verify with CRL URI status 404', async () => {
    const {chain} = await generateCertificateChain(3, true);
    const root = chain.pop();
    const configStub = sinon.stub(config, 'caStore').value([root.raw]);

    const verifiedChain = await verifyX509(chain);

    configStub.restore();
    assert.deepEqual(
      verifiedChain.errors,
      ['Failed to query CRL at http://example.com/crl - Received 404']
    );
    expect(verifiedChain.verified).to.be(false);
  });

  it('should fail to verify with CRL revoked entry', async () => {
    const {chain, crl} = await generateCertificateChain(3, true, true);
    const root = chain.pop();
    const configStub = sinon.stub(config, 'caStore').value([root.raw]);
    const fetchStub = sinon.stub(global, 'fetch').resolves(crlOk(crl));

    const verifiedChain = await verifyX509(chain);

    configStub.restore();
    fetchStub.restore();
    assert.deepEqual(
      verifiedChain.errors,
      ['x509 certificate has been revoked (CRL)']
    );
    expect(verifiedChain.verified).to.be(false);
  });

  it('should verify with valid CRL entry', async () => {
    const {chain, crl} = await generateCertificateChain(3, true, false);
    const root = chain.pop();
    const fetchStub = sinon.stub(global, 'fetch').resolves(crlOk(crl));
    const configStub = sinon.stub(config, 'caStore').value([root.raw]);

    const verifiedChain = await verifyX509(chain);

    configStub.restore();
    fetchStub.restore();
    assert.deepEqual(
      verifiedChain.errors,
      []
    );
    assert.ok(verifiedChain.verified);
  });

  it('should fail to verify invalid test cert', async () => {
    const cert = fs.readFileSync('./tests/fixtures/expired.badssl.com.cer');
    const verifiedCert = await verifyX509([new X509Certificate(cert)]);
    expect(verifiedCert.verified).to.be(false);
  });
});
