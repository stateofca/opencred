/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

// required polyfill for @peculiar/x509
import 'reflect-metadata';

import {
  BasicConstraintsExtension,
  X509CertificateGenerator
} from '@peculiar/x509';
import {
  describeIssuerCertificates,
  logIssuerCertificates
} from '../../lib/mdocIssuerCertificate.js';
import {config} from '@bedrock/core';
import {createHash} from 'node:crypto';
import {Crypto} from '@peculiar/webcrypto';
import expect from 'expect.js';
import {logger} from '../../lib/logger.js';

const webcrypto = new Crypto();
const signingAlgorithm = {
  name: 'ECDSA',
  namedCurve: 'P-256',
  hash: 'SHA-256'
};
const notBefore = new Date('2026-01-01T00:00:00Z');
const notAfter = new Date('2027-01-01T00:00:00Z');

/**
 * @param {string} name - Subject distinguished name.
 * @returns {Promise<{cert: object, keys: object}>} Self-signed root.
 */
async function mintRoot(name) {
  const keys = await webcrypto.subtle.generateKey(
    signingAlgorithm, false, ['sign', 'verify']);
  const cert = await X509CertificateGenerator.createSelfSigned({
    serialNumber: '01',
    name,
    notBefore,
    notAfter,
    signingAlgorithm,
    keys,
    extensions: [new BasicConstraintsExtension(true, 0, true)]
  }, webcrypto);
  return {cert, keys};
}

/**
 * @param {object} options - Options object.
 * @param {string} options.name - Subject distinguished name.
 * @param {{cert: object, keys: object}} options.root - Signing root.
 * @returns {Promise<object>} Document Signer certificate issued by `root`.
 */
async function mintLeaf({name, root}) {
  const keys = await webcrypto.subtle.generateKey(
    signingAlgorithm, false, ['sign', 'verify']);
  return X509CertificateGenerator.create({
    serialNumber: '0a1b',
    subject: name,
    issuer: root.cert.subject,
    notBefore,
    notAfter,
    signingAlgorithm,
    publicKey: keys.publicKey,
    signingKey: root.keys.privateKey
  }, webcrypto);
}

const sha256 = der => createHash('sha256').update(der).digest('hex');

/**
 * @param {Array<Uint8Array>} x5chain - DER certificates, leaf first.
 * @returns {object} Minimal stand-in for a verified `@auth0/mdl` MDoc.
 */
const mdocWith = x5chain => ({
  documents: [{
    docType: 'org.iso.18013.5.1.mDL',
    issuerSigned: {issuerAuth: {x5chain}}
  }]
});

describe('describeIssuerCertificates', () => {
  let walletRoot;
  let otherRoot;
  let leaf;

  before(async () => {
    walletRoot = await mintRoot('C=US, ST=US-CA, CN=Test IACA A');
    otherRoot = await mintRoot('C=US, ST=US-CA, CN=Test IACA B');
    leaf = await mintLeaf({
      name: 'C=US, ST=US-CA, O=Test DMV, CN=Test DS',
      root: walletRoot
    });
  });

  it('returns an empty array when there are no documents', () => {
    expect(describeIssuerCertificates({
      verifiedMdoc: {}, trustedCertificates: []
    })).to.eql([]);
  });

  it('describes the Document Signer certificate', () => {
    const der = new Uint8Array(leaf.rawData);
    const [result] = describeIssuerCertificates({
      verifiedMdoc: mdocWith([der]), trustedCertificates: []
    });
    expect(result.docType).to.be('org.iso.18013.5.1.mDL');
    expect(result.chainLength).to.be(1);
    expect(result.signer.subject).to.contain('CN=Test DS');
    expect(result.signer.subject).to.contain('O=Test DMV');
    expect(result.signer.issuer).to.contain('CN=Test IACA A');
    expect(result.signer.serialNumber).to.be('0A1B');
    expect(result.signer.sha256).to.be(sha256(der));
    expect(result.root).to.be(null);
  });

  it('identifies the trusted root that issued the chain', () => {
    const der = new Uint8Array(leaf.rawData);
    const [result] = describeIssuerCertificates({
      verifiedMdoc: mdocWith([der]),
      trustedCertificates: [
        otherRoot.cert.toString('pem'),
        walletRoot.cert.toString('pem')
      ]
    });
    expect(result.root.subject).to.contain('CN=Test IACA A');
    expect(result.root.sha256).to.be(sha256(
      new Uint8Array(walletRoot.cert.rawData)));
  });

  it('does not match a root with the same name but a different key',
    async () => {
      const impostor = await mintRoot('C=US, ST=US-CA, CN=Test IACA A');
      const [result] = describeIssuerCertificates({
        verifiedMdoc: mdocWith([new Uint8Array(leaf.rawData)]),
        trustedCertificates: [impostor.cert.toString('pem')]
      });
      expect(result.root).to.be(null);
    });

  it('returns null signer when x5chain is missing', () => {
    const [result] = describeIssuerCertificates({
      verifiedMdoc: mdocWith(undefined), trustedCertificates: []
    });
    expect(result.chainLength).to.be(0);
    expect(result.signer).to.be(null);
    expect(result.root).to.be(null);
  });

  it('returns null signer when the leaf does not parse', () => {
    const [result] = describeIssuerCertificates({
      verifiedMdoc: mdocWith([
        new Uint8Array([1, 2, 3]),
        new Uint8Array(walletRoot.cert.rawData)
      ]),
      trustedCertificates: []
    });
    expect(result.chainLength).to.be(2);
    expect(result.signer).to.be(null);
  });

  it('skips trusted certificates that do not parse', () => {
    const [result] = describeIssuerCertificates({
      verifiedMdoc: mdocWith([new Uint8Array(leaf.rawData)]),
      trustedCertificates: ['not a pem', walletRoot.cert.toString('pem')]
    });
    expect(result.root.subject).to.contain('CN=Test IACA A');
  });
});

describe('logIssuerCertificates', () => {
  let logged;
  let originalInfo;
  let prevOpencred;
  let root;
  let leaf;

  before(async () => {
    root = await mintRoot('C=US, ST=US-CA, CN=Test IACA A');
    leaf = await mintLeaf({name: 'C=US, CN=Test DS', root});
  });

  beforeEach(() => {
    logged = [];
    originalInfo = logger.info;
    logger.info = (message, meta) => logged.push({message, meta});
    prevOpencred = config.opencred;
    config.opencred = {options: {}};
  });

  afterEach(() => {
    logger.info = originalInfo;
    config.opencred = prevOpencred;
  });

  it('logs nothing when options.mdocIssuerCertificateLogging is off', () => {
    config.opencred.options.mdocIssuerCertificateLogging = false;
    logIssuerCertificates({
      verifiedMdoc: mdocWith([new Uint8Array(leaf.rawData)]),
      trustedCertificates: [root.cert.toString('pem')],
      workflow: {clientId: 'c1'},
      exchange: {id: 'e1', variables: {profile: 'cadmv-ios'}}
    });
    expect(logged).to.eql([]);
  });

  it('logs the descriptions with exchange id and profile when on', () => {
    config.opencred.options.mdocIssuerCertificateLogging = true;
    logIssuerCertificates({
      verifiedMdoc: mdocWith([new Uint8Array(leaf.rawData)]),
      trustedCertificates: [root.cert.toString('pem')],
      workflow: {clientId: 'c1'},
      exchange: {id: 'e1', variables: {profile: 'cadmv-ios'}}
    });
    expect(logged).to.have.length(1);
    expect(logged[0].message).to.be('presentation_event');
    expect(logged[0].meta.type).to.be('mdoc_issuer_certificates');
    expect(logged[0].meta.clientId).to.be('c1');
    expect(logged[0].meta.exchangeId).to.be('e1');
    expect(logged[0].meta.profile).to.be('cadmv-ios');
    expect(logged[0].meta.documents[0].root.subject)
      .to.contain('CN=Test IACA A');
  });

  it('does not throw when config.opencred is undefined', () => {
    config.opencred = undefined;
    expect(() => logIssuerCertificates({
      verifiedMdoc: mdocWith([new Uint8Array(leaf.rawData)]),
      trustedCertificates: [],
      exchange: {id: 'e1'}
    })).to.not.throwError();
    expect(logged).to.eql([]);
  });

  it('does not throw when the warning itself throws', () => {
    config.opencred.options.mdocIssuerCertificateLogging = true;
    const originalWarning = logger.warning;
    logger.info = () => {
      throw new Error('transport down');
    };
    logger.warning = () => {
      throw new Error('transport down');
    };
    try {
      expect(() => logIssuerCertificates({
        verifiedMdoc: mdocWith([new Uint8Array(leaf.rawData)]),
        trustedCertificates: [],
        exchange: {id: 'e1'}
      })).to.not.throwError();
    } finally {
      logger.warning = originalWarning;
    }
  });

  it('warns instead of throwing when the mdoc is malformed', () => {
    config.opencred.options.mdocIssuerCertificateLogging = true;
    const warnings = [];
    const originalWarning = logger.warning;
    logger.warning = (message, meta) => warnings.push({message, meta});
    try {
      expect(() => logIssuerCertificates({
        verifiedMdoc: {
          get documents() {
            throw new Error('malformed');
          }
        },
        trustedCertificates: [],
        exchange: {id: 'e1'}
      })).to.not.throwError();
    } finally {
      logger.warning = originalWarning;
    }
    expect(logged).to.eql([]);
    expect(warnings).to.have.length(1);
    expect(warnings[0].meta.exchangeId).to.be('e1');
  });
});
