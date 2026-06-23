/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as obCtx from '@digitalcredentials/open-badges-context';
import * as sinon from 'sinon';
import {encode as base58Encode} from 'base58-universal';
import {canonicalize} from 'json-canonicalize';
import expect from 'expect.js';
import {getDocumentLoader} from '../../common/documentLoader.js';
import {httpClient} from '@digitalbazaar/http-client';

const documentLoader = getDocumentLoader().build();

const exampleDidKeyId =
  'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';

// Build a did:key z2dm (jwk_jcs-pub, multicodec 0xeb51 -> varint d1 d6 03)
// identifier from a P-256 public JWK, mirroring how EUDI Wallet encodes the
// `iss` of its credentials. This is the inverse of the decode path added in
// common/documentLoader.js, so resolving it round-trips through fromJwk().
const JWK_JCS_PUB_MULTICODEC_HEADER = [0xd1, 0xd6, 0x03];
const encodeZ2dmDidKey = jwk => {
  const jwkBytes = new TextEncoder().encode(canonicalize(jwk));
  const bytes = new Uint8Array(
    JWK_JCS_PUB_MULTICODEC_HEADER.length + jwkBytes.length);
  bytes.set(JWK_JCS_PUB_MULTICODEC_HEADER, 0);
  bytes.set(jwkBytes, JWK_JCS_PUB_MULTICODEC_HEADER.length);
  return `did:key:z${base58Encode(bytes)}`;
};

// sample P-256 public JWK
const exampleP256Jwk = {
  crv: 'P-256',
  kty: 'EC',
  x: 'Di16iGSpSZ860BY4Igv_psd-y2R0tq4v4_vxVoUqPW0',
  y: 'v6QvWfgBfSV1xOxHmVjTPyiAcfjTaufzt7tiP6XoF6U'
};

describe('Document Loader', async () => {
  it('load did:key document', async function() {
    const didKeyData = await documentLoader(exampleDidKeyId);
    expect(didKeyData).property('document');
    expect(didKeyData).property('documentUrl');
    expect(didKeyData.document).property('id');
    expect(didKeyData.document).property('verificationMethod');
    expect(didKeyData.document).property('authentication');
    expect(didKeyData.document).property('assertionMethod');
    expect(didKeyData.document).property('capabilityDelegation');
    expect(didKeyData.document).property('capabilityInvocation');
    expect(didKeyData.document).property('keyAgreement');
    expect(didKeyData.document.id).equal(didKeyData.documentUrl);
  });

  it('load did:key z2dm (jwk_jcs-pub P-256) document', async function() {
    const z2dmDidKeyId = encodeZ2dmDidKey(exampleP256Jwk);
    const didKeyData = await documentLoader(z2dmDidKeyId);
    expect(didKeyData).property('document');
    expect(didKeyData).property('documentUrl');
    expect(didKeyData.document).property('id');
    expect(didKeyData.document).property('verificationMethod');
    expect(didKeyData.document).property('authentication');
    expect(didKeyData.document).property('assertionMethod');
    expect(didKeyData.document).property('capabilityDelegation');
    expect(didKeyData.document).property('capabilityInvocation');
    expect(didKeyData.document.id).equal(didKeyData.documentUrl);
    // resolves to a P-256 verification method; the document id is the canonical
    // p256-pub (zDna) form, since jwk_jcs-pub is normalized and routed there
    expect(didKeyData.document.verificationMethod[0])
      .property('publicKeyMultibase');
  });

  // z8DK / zYqN: same P-256 key, but a coordinate carries a leading sign byte
  // (33 bytes), shifting the base58 prefix. Multicodec routing + coordinate
  // normalization must resolve them to the same key as z2dm.
  it('load did:key jwk_jcs-pub with 33-byte coordinates', async function() {
    const pad33 = b64u => Buffer.concat(
      [Buffer.from([0]), Buffer.from(b64u, 'base64url')]).toString('base64url');
    const z2dm = encodeZ2dmDidKey(exampleP256Jwk);
    const z8dk = encodeZ2dmDidKey({
      ...exampleP256Jwk, y: pad33(exampleP256Jwk.y)});
    const zyqn = encodeZ2dmDidKey({
      ...exampleP256Jwk,
      x: pad33(exampleP256Jwk.x),
      y: pad33(exampleP256Jwk.y)
    });
    // the three encodings really do have different multibase prefixes
    expect(z8dk.slice(0, 12)).not.equal(z2dm.slice(0, 12));
    expect(zyqn.slice(0, 12)).not.equal(z2dm.slice(0, 12));
    const ids = [];
    for(const did of [z2dm, z8dk, zyqn]) {
      const data = await documentLoader(did);
      expect(data.document).property('verificationMethod');
      expect(data.document.verificationMethod[0])
        .property('publicKeyMultibase');
      ids.push(data.document.id);
    }
    // all variants normalize to the same canonical key / document id
    expect(ids[0]).equal(ids[1]);
    expect(ids[1]).equal(ids[2]);
  });

  it('load did:jwk document', async function() {
    const didJwkData = await documentLoader('did:jwk:eyJraWQiOiJ1cm46aWV0ZjpwYX\
JhbXM6b2F1dGg6andrLXRodW1icHJpbnQ6c2hhLTI1NjpoeGx4RmdnNF9hX202Tk1kVkJmbjVZa0huN\
Td6eDFvanpzVzROalpXalk4Iiwia3R5IjoiRUMiLCJjcnYiOiJQLTI1NiIsImFsZyI6IkVTMjU2Iiwi\
eCI6IkRpMTZpR1NwU1o4NjBCWTRJZ3ZfcHNkLXkyUjB0cTR2NF92eFZvVXFQVzAiLCJ5IjoidjZRdld\
mZ0JmU1YxeE94SG1WalRQeWlBY2ZqVGF1Znp0N3RpUDZYb0Y2VSJ9');
    expect(didJwkData).property('document');
    expect(didJwkData).property('documentUrl');
    expect(didJwkData.document).property('id');
    expect(didJwkData.document).property('verificationMethod');
    expect(didJwkData.document).property('authentication');
    expect(didJwkData.document).property('assertionMethod');
    expect(didJwkData.document).property('capabilityDelegation');
    expect(didJwkData.document).property('capabilityInvocation');
    expect(didJwkData.document.id).equal(didJwkData.documentUrl);
  });

  it('load did:web document', async function() {
    const stub = sinon.stub(httpClient, 'get');
    stub.withArgs('https://example.com/.well-known/did.json',
      sinon.match.any).returns({data: {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
        'https://w3id.org/security/suites/x25519-2020/v1'
      ],
      id: 'did:web:example.com',
      verificationMethod: [
        {
          id: 'did:web:example.com#1',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:web:example.com',
          publicKeyMultibase: 'z6Mkpw72M9suPCBv48X2Xj4YKZJH9W7wzEK1aS6JioKSo89C'
        }
      ],
      authentication: [
        'did:web:example.com#1'
      ],
      assertionMethod: [
        'did:web:example.com#1'
      ],
      capabilityDelegation: [
        'did:web:example.com#1'
      ],
      capabilityInvocation: [
        'did:web:example.com#1'
      ],
      keyAgreement: [
        {
          id: 'did:web:example.com#0',
          type: 'X25519KeyAgreementKey2020',
          controller: 'did:web:example.com',
          publicKeyMultibase: 'z6LSgxJr5q1pwHPbiK7u8Pw1GvnfMTZSMxkhaorQ1aJYWFz3'
        }
      ]
    }});
    const didWebData = await documentLoader('did:web:example.com');
    expect(didWebData).property('document');
    expect(didWebData).property('documentUrl');
    expect(didWebData.document).property('id');
    expect(didWebData.document).property('verificationMethod');
    expect(didWebData.document).property('authentication');
    expect(didWebData.document).property('assertionMethod');
    expect(didWebData.document).property('capabilityDelegation');
    expect(didWebData.document).property('capabilityInvocation');
    expect(didWebData.document.id).equal(didWebData.documentUrl);
    stub.restore();
  });

  describe('Static contexts', () => {
    it('loads Open Badges v3 context from the static map (no network)',
      async function() {
        const stub = sinon.stub(httpClient, 'get');
        try {
          const result = await documentLoader(obCtx.CONTEXT_URL_V3);
          expect(result).property('document');
          expect(result).property('documentUrl');
          expect(result.documentUrl).equal(obCtx.CONTEXT_URL_V3);
          expect(result.document).property('@context');
          // No network fetch should have happened for a static context.
          expect(stub.called).equal(false);
        } finally {
          stub.restore();
        }
      });
  });
});
