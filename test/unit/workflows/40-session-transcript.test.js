/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  buildOid4vpDcApiHandoverInfo,
  buildOid4vpDirectPostHandoverInfo,
  encodeSessionTranscript
} from '../../../lib/workflows/common/session-transcript.js';
import crypto from 'node:crypto';
import {DataItem} from '@auth0/mdl';
import expect from 'expect.js';

/**
 * @param {Uint8Array} a - First byte sequence.
 * @param {Uint8Array} b - Second byte sequence.
 */
function assertEqualBytes(a, b) {
  expect(a instanceof Uint8Array).to.be(true);
  expect(b instanceof Uint8Array).to.be(true);
  expect(a.length).to.eql(b.length);
  expect(Array.from(a)).to.eql(Array.from(b));
}

/**
 * Reference encoder matching OID4VP 1.0 §B.2.6.2 (same pipeline as
 * `encodeSessionTranscript`).
 *
 * @param {string} label - OpenID4VPDCAPIHandover or OpenID4VPHandover.
 * @param {Array} handoverInfo - HandoverInfo tuple before hashing.
 * @returns {Uint8Array} Double-CBOR-encoded session transcript bytes.
 */
function referenceSessionTranscriptBytes(label, handoverInfo) {
  const handoverInfoBytes = DataItem.fromData(handoverInfo).buffer;
  const hash = crypto.createHash('sha256');
  hash.update(handoverInfoBytes);
  const handoverInfoHash = new Uint8Array(hash.digest());
  const handover = [label, handoverInfoHash];
  const outer = DataItem.fromData([null, null, handover]);
  return DataItem.fromData(outer).buffer;
}

describe('session-transcript', () => {
  describe('buildOid4vpDcApiHandoverInfo', () => {
    it('returns [origin, nonce, jwkThumbprint] defaulting thumbprint to null',
      () => {
        const t = buildOid4vpDcApiHandoverInfo({
          origin: 'https://rp.example',
          nonce: 'abc'
        });
        expect(t).to.eql(['https://rp.example', 'abc', null]);
      });

    it('preserves explicit null thumbprint', () => {
      const t = buildOid4vpDcApiHandoverInfo({
        origin: 'https://rp.example',
        nonce: 'abc',
        jwkThumbprint: null
      });
      expect(t).to.eql(['https://rp.example', 'abc', null]);
    });

    it('preserves Uint8Array thumbprint', () => {
      const tp = new Uint8Array([9, 8, 7]);
      const t = buildOid4vpDcApiHandoverInfo({
        origin: 'https://rp.example',
        nonce: 'abc',
        jwkThumbprint: tp
      });
      expect(t[0]).to.eql('https://rp.example');
      expect(t[1]).to.eql('abc');
      expect(t[2]).to.be(tp);
    });

    it('rejects empty origin', () => {
      expect(() => buildOid4vpDcApiHandoverInfo({
        origin: '',
        nonce: 'n'
      })).to.throwError(/origin must be a non-empty string/);
    });
  });

  describe('buildOid4vpDirectPostHandoverInfo', () => {
    it('returns tuple with default null thumbprint when jwk omitted', () => {
      const t = buildOid4vpDirectPostHandoverInfo({
        clientId: 'did:web:ex',
        nonce: 'n1',
        responseUri: 'https://rp.example/cb'
      });
      expect(t).to.eql(['did:web:ex', 'n1', null, 'https://rp.example/cb']);
    });

    it('preserves explicit null thumbprint and responseUri', () => {
      const t = buildOid4vpDirectPostHandoverInfo({
        clientId: 'did:web:ex',
        nonce: 'n1',
        jwkThumbprint: null,
        responseUri: null
      });
      expect(t).to.eql(['did:web:ex', 'n1', null, null]);
    });

    it('rejects empty clientId', () => {
      expect(() => buildOid4vpDirectPostHandoverInfo({
        clientId: '',
        nonce: 'n',
        responseUri: 'https://x'
      })).to.throwError(/clientId must be a non-empty string/);
    });
  });

  describe('encodeSessionTranscript', () => {
    it('throws for unsupported responseMode', () => {
      expect(() => encodeSessionTranscript({
        responseMode: 'fragment',
        origin: 'https://o',
        nonce: 'n'
      })).to.throwError(/Unsupported response_mode for session transcript/);
    });

    it('returns Uint8Array for dc_api', () => {
      const out = encodeSessionTranscript({
        responseMode: 'dc_api',
        origin: 'https://rp.example',
        nonce: 'nonce-1',
        jwkThumbprint: null
      });
      expect(out instanceof Uint8Array).to.be(true);
      expect(out.length).to.be.greaterThan(0);
    });

    it('matches reference bytes for dc_api with null thumbprint', () => {
      const origin = 'https://rp.example';
      const nonce = 'nonce-1';
      const got = encodeSessionTranscript({
        responseMode: 'dc_api',
        origin,
        nonce,
        jwkThumbprint: null
      });
      const exp = referenceSessionTranscriptBytes(
        'OpenID4VPDCAPIHandover',
        [origin, nonce, null]);
      assertEqualBytes(got, exp);
    });

    it('matches reference bytes for dc_api when jwkThumbprint key omitted',
      () => {
        const origin = 'https://rp.example';
        const nonce = 'nonce-1';
        const got = encodeSessionTranscript({
          responseMode: 'dc_api',
          origin,
          nonce
        });
        const exp = referenceSessionTranscriptBytes(
          'OpenID4VPDCAPIHandover',
          [origin, nonce, null]);
        assertEqualBytes(got, exp);
      });

    it('matches reference bytes for dc_api with Uint8Array thumbprint',
      () => {
        const origin = 'https://rp.example';
        const nonce = 'nonce-1';
        const tp = new Uint8Array([1, 2, 3, 255]);
        const got = encodeSessionTranscript({
          responseMode: 'dc_api',
          origin,
          nonce,
          jwkThumbprint: tp
        });
        const exp = referenceSessionTranscriptBytes(
          'OpenID4VPDCAPIHandover',
          [origin, nonce, tp]);
        assertEqualBytes(got, exp);
      });

    it('matches reference bytes for dc_api.jwt', () => {
      const origin = 'https://rp.example';
      const nonce = 'nonce-1';
      const tp = new Uint8Array(32).fill(7);
      const got = encodeSessionTranscript({
        responseMode: 'dc_api.jwt',
        origin,
        nonce,
        jwkThumbprint: tp
      });
      const exp = referenceSessionTranscriptBytes(
        'OpenID4VPDCAPIHandover',
        [origin, nonce, tp]);
      assertEqualBytes(got, exp);
    });

    it('matches reference bytes for direct_post', () => {
      const clientId = 'did:web:example.com';
      const nonce = 'n2';
      const responseUri = 'https://rp.example/post';
      const got = encodeSessionTranscript({
        responseMode: 'direct_post',
        clientId,
        nonce,
        jwkThumbprint: null,
        responseUri
      });
      const exp = referenceSessionTranscriptBytes(
        'OpenID4VPHandover',
        [clientId, nonce, null, responseUri]);
      assertEqualBytes(got, exp);
    });
  });
});
