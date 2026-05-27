/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {cborDecode, DataItem} from '@auth0/mdl/lib/cbor/index.js';
import expect from 'expect.js';

import {
  BadMdocRequestError,
  buildDeviceRequest,
  buildDeviceRequestInfo,
  buildItemsRequestBytesList
} from '../../../lib/workflows/common/mdoc-device-request.js';
import {mapsToPlain} from '../../utils/mapsToPlain.js';

describe('mdoc-device-request', () => {
  describe('buildDeviceRequest', () => {
    it('encodes single mdoc query with tag-24 ItemsRequest and map nameSpaces',
      () => {
        const single = buildDeviceRequest({
          dcqlQuery: {
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
                  intent_to_retain: false
                }
              ]
            }]
          }
        });
        const decoded = cborDecode(single);
        expect(decoded.get('version')).to.equal('1.1');
        expect(decoded.get('docRequests').length).to.eql(1);
        const itemsRequest = decoded.get('docRequests')[0].get(
          'itemsRequest');
        expect(itemsRequest instanceof DataItem).to.be(true);
        expect(mapsToPlain(itemsRequest.data)).to.eql({
          docType: 'org.iso.18013.5.1.mDL',
          nameSpaces: {
            'org.iso.18013.5.1': {
              given_name: false,
              family_name: false
            }
          }
        });
        const nsPlain = mapsToPlain(itemsRequest.data).nameSpaces[
          'org.iso.18013.5.1'];
        expect(Array.isArray(nsPlain)).to.be(false);
        expect(nsPlain.given_name).to.be(false);
        expect(nsPlain.family_name).to.be(false);
        const dri = decoded.get('deviceRequestInfo');
        expect(mapsToPlain(dri.data)).to.eql({
          useCases: [{mandatory: true, documentSets: [[0]]}]
        });
        expect(decoded.has('readerAuthAll')).to.be(false);
      });

    it('encodes intent_to_retain=true when claim.intent_to_retain is true',
      () => {
        const bytes = buildDeviceRequest({
          dcqlQuery: {
            credentials: [{
              id: 'x',
              format: 'mso_mdoc',
              meta: {doctype_value: 'org.iso.18013.5.1.mDL'},
              claims: [{
                path: ['org.iso.18013.5.1', 'given_name'],
                intent_to_retain: true
              }]
            }]
          }
        });
        const decoded = cborDecode(bytes);
        const itemsRequest = decoded.get('docRequests')[0].get(
          'itemsRequest');
        const nsPlain = mapsToPlain(itemsRequest.data).nameSpaces[
          'org.iso.18013.5.1'];
        expect(nsPlain.given_name).to.be(true);
      });

    it('encodes intent_to_retain=false when claim.intent_to_retain is ' +
      'absent (default)', () => {
      const bytes = buildDeviceRequest({
        dcqlQuery: {
          credentials: [{
            id: 'x',
            format: 'mso_mdoc',
            meta: {doctype_value: 'org.iso.18013.5.1.mDL'},
            claims: [{path: ['org.iso.18013.5.1', 'given_name']}]
          }]
        }
      });
      const decoded = cborDecode(bytes);
      const itemsRequest = decoded.get('docRequests')[0].get(
        'itemsRequest');
      const nsPlain = mapsToPlain(itemsRequest.data).nameSpaces[
        'org.iso.18013.5.1'];
      expect(nsPlain.given_name).to.be(false);
    });

    it('sets documentSets to alternatives [[0], [1]] for two mdoc queries',
      () => {
        const two = buildDeviceRequest({
          dcqlQuery: {
            credentials: [
              {
                id: 'a',
                format: 'mso_mdoc',
                meta: {doctype_value: 'org.iso.18013.5.1.mDL'},
                claims: [{path: ['org.iso.18013.5.1', 'given_name']}]
              },
              {
                id: 'b',
                format: 'mso_mdoc',
                meta: {doctype_value: 'com.example.other'},
                claims: [{path: ['com.example.ns', 'foo']}]
              }
            ]
          }
        });
        const decoded = cborDecode(two);
        expect(decoded.get('docRequests').length).to.eql(2);
        expect(mapsToPlain(decoded.get('deviceRequestInfo').data)).to.eql({
          useCases: [{mandatory: true, documentSets: [[0], [1]]}]
        });
      });

    it('includes readerAuthAll when a non-empty array is passed', () => {
      const signStubs = [{alg: 'ES256'}, {kid: 'key-1'}];
      const bytes = buildDeviceRequest({
        dcqlQuery: {
          credentials: [{
            id: 'x',
            format: 'mso_mdoc',
            claims: [{path: ['org.iso.18013.5.1', 'given_name']}]
          }]
        },
        readerAuthAll: signStubs
      });
      const decoded = cborDecode(bytes);
      expect(mapsToPlain(decoded.get('readerAuthAll'))).to.eql(signStubs);
    });

    it('throws BadMdocRequestError when there are no mdoc credentials',
      () => {
        expect(() => buildDeviceRequest({
          dcqlQuery: {credentials: []}
        })).to.throwError(e => {
          expect(e).to.be.a(BadMdocRequestError);
          expect(e.statusCode).to.eql(400);
          expect(e.errorCode).to.equal('BAD_MDOC_REQUEST');
        });
      });
  });

  describe('buildDeviceRequestInfo', () => {
    it('rejects non-positive docRequestCount', () => {
      expect(() => buildDeviceRequestInfo({docRequestCount: 0}))
        .to.throwError(e => {
          expect(e).to.be.a(BadMdocRequestError);
          expect(e.statusCode).to.eql(400);
        });
    });
  });

  describe('buildItemsRequestBytesList', () => {
    it('produces decodable tag-24 ItemsRequestBytes', () => {
      const itemsRequestList = [{
        docType: 'org.iso.18013.5.1.mDL',
        nameSpaces: {
          'org.iso.18013.5.1': {given_name: false}
        }
      }];
      const [wrapped] = buildItemsRequestBytesList({itemsRequestList});
      const outer = cborDecode(wrapped);
      expect(outer instanceof DataItem).to.be(true);
      expect(mapsToPlain(outer.data).docType).to.equal(
        'org.iso.18013.5.1.mDL');
    });
  });
});
