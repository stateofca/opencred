/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as base64url from 'base64url-universal';
import {cborEncode} from '@auth0/mdl/lib/cbor/index.js';
import expect from 'expect.js';

import {
  classifyReaderAuthEntry,
  decodeDeviceRequestB64,
  decodeEncryptionInfoB64
} from '../../utils/dc-api-cbor.js';
import {buildDeviceRequest} from
  '../../../lib/workflows/common/mdoc-device-request.js';

const MDOC_QUERY = {
  credentials: [{
    id: 'x',
    format: 'mso_mdoc',
    meta: {doctype_value: 'org.iso.18013.5.1.mDL'},
    claims: [
      {
        path: ['org.iso.18013.5.1', 'given_name'],
        intent_to_retain: false
      },
      {
        path: ['org.iso.18013.5.1', 'family_name'],
        intent_to_retain: true
      }
    ]
  }]
};

describe('dc-api-cbor', () => {
  describe('decodeDeviceRequestB64', () => {
    it('round-trips a synthetic device request without readerAuthAll',
      () => {
        const bytes = buildDeviceRequest({dcqlQuery: MDOC_QUERY});
        const b64 = base64url.encode(bytes);
        const decoded = decodeDeviceRequestB64({deviceRequest: b64});

        expect(decoded.version).to.equal('1.1');
        expect(decoded.topLevelKeys).to.eql([
          'deviceRequestInfo', 'docRequests', 'version'
        ]);
        expect(decoded.docRequests.length).to.equal(1);
        expect(decoded.docRequests[0].docType).to.equal(
          'org.iso.18013.5.1.mDL');
        expect(decoded.docRequests[0].nameSpaces).to.eql({
          'org.iso.18013.5.1': {
            given_name: false,
            family_name: true
          }
        });
        expect(decoded.deviceRequestInfo).to.eql({
          useCases: [{mandatory: true, documentSets: [[0]]}]
        });
        expect(decoded.readerAuthAll).to.eql([]);
        expect(decoded.raw).to.be.a(Map);
        expect(decoded.plain.version).to.equal('1.1');
      });

    it('round-trips a synthetic device request with readerAuthAll',
      () => {
        const encodedProtectedHeaders = new Uint8Array([0xa1, 0x01, 0x26]);
        const unprotectedHeaders = new Map([[33, new Uint8Array([9, 8, 7])]]);
        const signature = new Uint8Array([1, 2, 3, 4]);
        const bytes = buildDeviceRequest({
          dcqlQuery: MDOC_QUERY,
          readerAuthAll: [[
            encodedProtectedHeaders,
            unprotectedHeaders,
            null,
            signature
          ]]
        });
        const b64 = base64url.encode(bytes);
        const decoded = decodeDeviceRequestB64({deviceRequest: b64});

        expect(decoded.topLevelKeys).to.eql([
          'deviceRequestInfo',
          'docRequests',
          'readerAuthAll',
          'version'
        ]);
        expect(decoded.readerAuthAll.length).to.equal(1);
        expect(decoded.readerAuthAll[0].shape).to.equal('array4');
        expect(Array.isArray(decoded.readerAuthAll[0].elements)).to.be(true);
        expect(decoded.readerAuthAll[0].elements.length).to.equal(4);
        expect(decoded.readerAuthAll[0].elements[2]).to.be(null);
      });
  });

  describe('classifyReaderAuthEntry', () => {
    it('classifies a 4-element array with null payload', () => {
      const entry = [
        new Uint8Array([0xa1, 0x01, 0x26]),
        new Map([[33, new Uint8Array([1])]]),
        null,
        new Uint8Array(64)
      ];
      const result = classifyReaderAuthEntry({entry});
      expect(result.shape).to.equal('array4');
      expect(result.payloadKind).to.equal('null');
      expect(result.protectedBstrLength).to.equal(3);
      expect(result.signatureLength).to.equal(64);
      expect(result.unprotectedHeaderKeys).to.eql([33]);
    });

    it('classifies an object with named COSE Sign1 keys as map', () => {
      const entry = {
        encodedProtectedHeaders: new Uint8Array([1, 2]),
        unprotectedHeaders: {33: new Uint8Array([9])},
        payload: new Uint8Array(),
        signature: new Uint8Array([3, 4])
      };
      const result = classifyReaderAuthEntry({entry});
      expect(result.shape).to.equal('map');
      expect(result.payloadKind).to.equal('bstr-empty');
      expect(result.protectedBstrLength).to.equal(2);
      expect(result.signatureLength).to.equal(2);
      expect(result.unprotectedHeaderKeys).to.eql([33]);
    });
  });

  describe('decodeEncryptionInfoB64', () => {
    it('round-trips a manually-built dcapi envelope', () => {
      const nonce = new Uint8Array(16);
      nonce.fill(0xab);
      const recipientPublicKey = {
        1: 2,
        '-1': 1,
        '-2': new Uint8Array(32),
        '-3': new Uint8Array(32)
      };
      const envelope = ['dcapi', {nonce, recipientPublicKey}];
      const b64 = base64url.encode(cborEncode(envelope));
      const decoded = decodeEncryptionInfoB64({encryptionInfo: b64});

      expect(decoded.tag).to.equal('dcapi');
      expect(decoded.nonceLength).to.equal(16);
      expect(Buffer.from(decoded.nonce)).to.eql(Buffer.from(nonce));
      expect(decoded.recipientPublicKey['1']).to.equal(2);
      expect(decoded.recipientPublicKey['-1']).to.equal(1);
    });
  });
});
