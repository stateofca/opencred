/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {randomBytes} from 'node:crypto';

import * as base64url from 'base64url-universal';
import {
  SubjectAlternativeNameExtension,
  X509CertificateGenerator
} from '@peculiar/x509';
import {Crypto} from '@peculiar/webcrypto';
import expect from 'expect.js';

import {
  buildAuditPayload,
  renderPretty
} from '../../../scripts/dc-api-request-audit/report.js';
import {buildDeviceRequest} from
  '../../../lib/workflows/common/mdoc-device-request.js';
import {compareAudits} from
  '../../../scripts/dc-api-request-audit/compare.js';
import {decodeDeviceRequestB64} from
  '../../../scripts/dc-api-request-audit/decode.js';
import {inspectCertificate} from
  '../../../scripts/dc-api-request-audit/inspect-cert.js';

const webcrypto = new Crypto();
const signingAlgorithm = {
  name: 'ECDSA',
  namedCurve: 'P-256',
  hash: 'SHA-256'
};

const MDOC_QUERY = {
  credentials: [{
    id: 'x',
    format: 'mso_mdoc',
    meta: {doctype_value: 'org.iso.18013.5.1.mDL'},
    claims: [{
      path: ['org.iso.18013.5.1', 'given_name'],
      intent_to_retain: false
    }]
  }]
};

/**
 * @param {object} options - Options object.
 * @param {string[]} [options.sanHosts] - SAN DNS names for the leaf.
 * @returns {Promise<Uint8Array>} DER-encoded self-signed leaf cert.
 */
async function mintLeafDer({sanHosts = ['audit-test.local']} = {}) {
  const keys = await webcrypto.subtle.generateKey(
    signingAlgorithm, false, ['sign', 'verify']);
  const now = new Date();
  const cert = await X509CertificateGenerator.createSelfSigned({
    name: 'CN=audit-cli-test, O=OpenCred Test',
    notBefore: now,
    notAfter: new Date(
      now.getFullYear() + 1, now.getMonth(), now.getDate()),
    signingAlgorithm,
    keys,
    extensions: [
      new SubjectAlternativeNameExtension(
        sanHosts.map(value => ({type: 'dns', value}))
      )
    ]
  }, webcrypto);
  return new Uint8Array(cert.rawData);
}

/**
 * @returns {Promise<object>} Audit payload with array4 readerAuthAll.
 */
async function buildSyntheticAudit() {
  const leafDer = await mintLeafDer();
  const encodedProtectedHeaders = new Uint8Array([0xa1, 0x01, 0x26]);
  const unprotectedHeaders = new Map([[33, leafDer]]);
  const signature = new Uint8Array(64);
  const bytes = buildDeviceRequest({
    dcqlQuery: MDOC_QUERY,
    readerAuthAll: [[
      encodedProtectedHeaders,
      unprotectedHeaders,
      null,
      signature
    ]]
  });
  const decoded = decodeDeviceRequestB64({
    deviceRequest: base64url.encode(bytes)
  });
  return buildAuditPayload({deviceRequest: decoded});
}

describe('audit-dc-api-request helpers', () => {
  describe('inspectCertificate', () => {
    it('extracts subject CN, SAN DNS names, and signature algorithm',
      async () => {
        const der = await mintLeafDer({
          sanHosts: ['reader.example.com', 'alt.example.com']
        });
        const info = inspectCertificate({der});

        expect(info.subjectCN).to.equal('audit-cli-test');
        expect(info.sanDnsNames).to.eql([
          'reader.example.com',
          'alt.example.com'
        ]);
        expect(info.signatureAlgorithm).to.equal('ecdsa-with-SHA-256');
        expect(info.keyAlgorithm).to.contain('ECDSA');
        expect(info.sha256Fingerprint).to.match(
          /^([0-9a-f]{2}:){31}[0-9a-f]{2}$/);
        expect(info.serialNumber).to.be.a('string');
        expect(info.notBefore).to.match(/^\d{4}-\d{2}-\d{2}T/);
      });
  });

  describe('buildAuditPayload', () => {
    it('includes deviceRequest and certificates for readerAuthAll input',
      async () => {
        const audit = await buildSyntheticAudit();
        expect(audit).to.only.have.keys(
          'deviceRequest', 'certificates');
        expect(audit.deviceRequest).to.only.have.keys(
          'version',
          'topLevelKeys',
          'topLevelKeysExpected',
          'topLevelKeysMatch',
          'docRequests',
          'deviceRequestInfo',
          'readerAuthAll'
        );
        expect(audit.deviceRequest.topLevelKeysMatch).to.be(true);
        expect(audit.certificates.chainLength).to.equal(1);
        expect(audit.certificates.leaf.subjectCN).to.equal('audit-cli-test');
      });

    it('reports inspectionError when x5chain bytes are not valid DER',
      () => {
        const garbageDer = new Uint8Array(randomBytes(32));
        const bytes = buildDeviceRequest({
          dcqlQuery: MDOC_QUERY,
          readerAuthAll: [[
            new Uint8Array([0xa1, 0x01, 0x26]),
            new Map([[33, garbageDer]]),
            null,
            new Uint8Array(64)
          ]]
        });
        const decoded = decodeDeviceRequestB64({
          deviceRequest: base64url.encode(bytes)
        });
        const audit = buildAuditPayload({deviceRequest: decoded});

        expect(audit.certificates.inspectionError).to.be.a('string');
        expect(audit.certificates.inspectionError.length).to.be.greaterThan(0);
        expect(audit.certificates.leaf).to.be(null);
        expect(renderPretty({audit})).to.contain('inspection error:');
      });

    it('includes encryptionInfo when provided', async () => {
      const decoded = decodeDeviceRequestB64({
        deviceRequest: base64url.encode(
          buildDeviceRequest({dcqlQuery: MDOC_QUERY})
        )
      });
      const encryptionInfo = {
        tag: 'dcapi',
        nonce: new Uint8Array(16),
        recipientPublicKey: {kty: 2, alg: -7, crv: 1},
        nonceLength: 16
      };
      const audit = buildAuditPayload({deviceRequest: decoded, encryptionInfo});
      expect(audit.encryptionInfo).to.eql({
        tag: 'dcapi',
        nonceLength: 16,
        recipientPublicKey: {kty: 2, alg: -7, crv: 1}
      });
    });
  });

  describe('renderPretty', () => {
    it('emits DeviceRequest header and docType string', async () => {
      const audit = await buildSyntheticAudit();
      const text = renderPretty({audit});
      expect(text).to.contain('## DeviceRequest');
      expect(text).to.contain('org.iso.18013.5.1.mDL');
      expect(text).to.contain('shape: array4');
      expect(text).to.contain('payload kind: null');
      expect(text).to.contain('leaf subject CN: audit-cli-test');
    });
  });

  describe('compareAudits', () => {
    it('returns empty differences for identical audits', async () => {
      const audit = await buildSyntheticAudit();
      const diff = compareAudits({left: audit, right: audit});
      expect(diff.differences).to.eql([]);
      expect(diff.wireShapeDelta).to.be(null);
      expect(diff.matches.length).to.be.greaterThan(0);
    });

    it('flags wireShapeDelta when left is array4 and right is map',
      async () => {
        const left = await buildSyntheticAudit();
        const right = structuredClone(left);
        right.deviceRequest.readerAuthAll = [{
          shape: 'map',
          payloadKind: 'bstr-empty',
          protectedBstrLength: 2,
          signatureLength: 2,
          unprotectedHeaderKeys: [33]
        }];
        const diff = compareAudits({left, right});

        expect(diff.wireShapeDelta).to.eql({
          left: ['array4'],
          right: ['map']
        });
        expect(diff.differences.some(d =>
          d.path === 'deviceRequest.readerAuthAll[0].shape' &&
          d.kind === 'shape')).to.be(true);
      });
  });
});
