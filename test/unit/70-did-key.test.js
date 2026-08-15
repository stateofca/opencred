/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {
  canonicalJwkJcsPubDid, decodeJwkJcsPubDidKey, MULTICODEC_JWK_JCS_PUB,
  readVarint, resolveJwkJcsPubDidKey
} from '../../lib/did/jwk-jcs-pub.js';
import {exportJWK, generateKeyPair, SignJWT} from 'jose';
import {encode as base58Encode} from 'base58-universal';
import {canonicalize} from 'json-canonicalize';
import {didKeyDriver} from '../../lib/did/did-key.js';
import expect from 'expect.js';
import {verifyJWT} from 'did-jwt';

// varint(0xeb51) = d1 d6 03
const JWK_JCS_PUB_MULTICODEC_HEADER = [0xd1, 0xd6, 0x03];

// Encode a JWK exactly as an issuer would (JCS + varint + base58btc); the
// inverse of the module's decode path. Serializes the JWK as given so tests can
// construct non-canonical inputs.
const encodeJwkJcsPubDidKey = jwk => {
  const jwkBytes = new TextEncoder().encode(canonicalize(jwk));
  const bytes = new Uint8Array(
    JWK_JCS_PUB_MULTICODEC_HEADER.length + jwkBytes.length);
  bytes.set(JWK_JCS_PUB_MULTICODEC_HEADER, 0);
  bytes.set(jwkBytes, JWK_JCS_PUB_MULTICODEC_HEADER.length);
  return `did:key:z${base58Encode(bytes)}`;
};

// Encode a JWK preserving the given member order (JSON.stringify, not JCS), so
// tests can construct a non-canonically-ordered did:key — the TWDIW wallet
// serializes as {kty,x,y,crv}, which canonicalize() cannot reproduce because it
// always sorts. Everything else matches the wire format (varint + base58btc).
const encodeJwkJcsPubDidKeyRaw = jwk => {
  const jwkBytes = new TextEncoder().encode(JSON.stringify(jwk));
  const bytes = new Uint8Array(
    JWK_JCS_PUB_MULTICODEC_HEADER.length + jwkBytes.length);
  bytes.set(JWK_JCS_PUB_MULTICODEC_HEADER, 0);
  bytes.set(jwkBytes, JWK_JCS_PUB_MULTICODEC_HEADER.length);
  return `did:key:z${base58Encode(bytes)}`;
};

// A canonical P-256 public JWK ({crv,kty,x,y}, 32-byte coordinates).
const exampleP256Jwk = {
  crv: 'P-256',
  kty: 'EC',
  x: 'Di16iGSpSZ860BY4Igv_psd-y2R0tq4v4_vxVoUqPW0',
  y: 'v6QvWfgBfSV1xOxHmVjTPyiAcfjTaufzt7tiP6XoF6U'
};

const pad33 = b64u => Buffer.concat(
  [Buffer.from([0]), Buffer.from(b64u, 'base64url')]).toString('base64url');

const rejects = async promise => {
  let error;
  try {
    await promise;
  } catch(e) {
    error = e;
  }
  expect(error).to.be.an(Error);
  return error;
};

describe('did:key jwk_jcs-pub DID support module', () => {
  describe('readVarint', () => {
    it('decodes the multi-byte 0xeb51 header', () => {
      const {value, length} = readVarint(
        Uint8Array.from([...JWK_JCS_PUB_MULTICODEC_HEADER, 0x7b]));
      expect(value).equal(MULTICODEC_JWK_JCS_PUB);
      expect(length).equal(3);
    });

    it('decodes a single-byte varint', () => {
      const {value, length} = readVarint(Uint8Array.from([0x08, 0xff]));
      expect(value).equal(8);
      expect(length).equal(1);
    });
  });

  describe('canonicalJwkJcsPubDid', () => {
    it('produces a stable did:key for a canonical P-256 JWK', () => {
      const did = canonicalJwkJcsPubDid({jwk: exampleP256Jwk});
      expect(did).equal(encodeJwkJcsPubDidKey(exampleP256Jwk));
      expect(did.startsWith('did:key:z2dm')).equal(true);
    });

    it('ignores member order (only crv,kty,x,y, JCS-sorted)', () => {
      const reordered = {
        y: exampleP256Jwk.y, x: exampleP256Jwk.x,
        kty: exampleP256Jwk.kty, crv: exampleP256Jwk.crv, use: 'sig'
      };
      expect(canonicalJwkJcsPubDid({jwk: reordered}))
        .equal(canonicalJwkJcsPubDid({jwk: exampleP256Jwk}));
    });
  });

  describe('decodeJwkJcsPubDidKey', () => {
    it('accepts a canonical P-256 jwk_jcs-pub did:key', async () => {
      const did = encodeJwkJcsPubDidKey(exampleP256Jwk);
      const decoded = await decodeJwkJcsPubDidKey({did});
      expect(decoded).to.be.an('object');
      expect(decoded.jwk).eql(exampleP256Jwk);
      expect(decoded.multibase).equal(did.slice('did:key:'.length));
    });

    it('returns null for a non-jwk_jcs-pub did:key (falls through)',
      async () => {
        const did =
          'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';
        expect(await decodeJwkJcsPubDidKey({did})).equal(null);
      });

    it('returns null for a non-did:key input', async () => {
      expect(await decodeJwkJcsPubDidKey({did: 'did:web:example.com'}))
        .equal(null);
      expect(await decodeJwkJcsPubDidKey({did: undefined})).equal(null);
    });

    it('rejects extra JWK members (aliasing)', async () => {
      const did = encodeJwkJcsPubDidKey({...exampleP256Jwk, use: 'sig'});
      await rejects(decodeJwkJcsPubDidKey({did}));
    });

    it('rejects a 33-byte (sign-byte) coordinate', async () => {
      const did = encodeJwkJcsPubDidKey({
        ...exampleP256Jwk, y: pad33(exampleP256Jwk.y)});
      await rejects(decodeJwkJcsPubDidKey({did}));
    });

    it('rejects a non-P-256 curve', async () => {
      const did = encodeJwkJcsPubDidKey({...exampleP256Jwk, crv: 'P-384'});
      await rejects(decodeJwkJcsPubDidKey({did}));
    });

    it('rejects a non-EC key type', async () => {
      const did = encodeJwkJcsPubDidKey({
        kty: 'OKP', crv: 'Ed25519', x: exampleP256Jwk.x});
      await rejects(decodeJwkJcsPubDidKey({did}));
    });
  });

  describe('decodeJwkJcsPubDidKey (acceptNonCanonical)', () => {
    // The TWDIW wallet serializes the holder JWK as {kty,x,y,crv} — a valid
    // P-256 key in a non-canonical member order.
    const reorderedJwk = {
      kty: exampleP256Jwk.kty, x: exampleP256Jwk.x,
      y: exampleP256Jwk.y, crv: exampleP256Jwk.crv
    };

    it('rejects a non-canonically-ordered did:key by default', async () => {
      const did = encodeJwkJcsPubDidKeyRaw(reorderedJwk);
      await rejects(decodeJwkJcsPubDidKey({did}));
    });

    it('accepts a non-canonically-ordered did:key when opted in', async () => {
      const did = encodeJwkJcsPubDidKeyRaw(reorderedJwk);
      const decoded = await decodeJwkJcsPubDidKey(
        {did, acceptNonCanonical: true});
      expect(decoded).to.be.an('object');
      // Decoded to the canonical {crv,kty,x,y} JWK regardless of input order.
      expect(decoded.jwk).eql(exampleP256Jwk);
      // Keyed to the requested (non-canonical) DID, not the canonical one.
      expect(decoded.multibase).equal(did.slice('did:key:'.length));
    });

    it('still rejects invalid coordinates even when opted in', async () => {
      const did = encodeJwkJcsPubDidKeyRaw(
        {...reorderedJwk, y: pad33(exampleP256Jwk.y)});
      await rejects(decodeJwkJcsPubDidKey({did, acceptNonCanonical: true}));
    });

    it('still returns null for a non-jwk_jcs-pub did:key when opted in',
      async () => {
        const did =
          'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';
        expect(await decodeJwkJcsPubDidKey({did, acceptNonCanonical: true}))
          .equal(null);
      });
  });

  describe('didKeyDriver.get (installed resolution)', () => {
    it('resolves a canonical jwk_jcs-pub DID to a requested-DID document',
      async () => {
        const did = encodeJwkJcsPubDidKey(exampleP256Jwk);
        const multibase = did.slice('did:key:'.length);
        const doc = await didKeyDriver.get({did});
        expect(doc.id).equal(did);
        const [vm] = doc.verificationMethod;
        expect(vm.type).equal('JsonWebKey2020');
        expect(vm.id).equal(`${did}#${multibase}`);
        expect(vm.controller).equal(did);
        expect(vm.publicKeyJwk).eql(exampleP256Jwk);
        for(const rel of ['authentication', 'assertionMethod',
          'capabilityDelegation', 'capabilityInvocation']) {
          expect(doc[rel]).eql([`${did}#${multibase}`]);
        }
      });

    it('resolves a single verification method by fragment', async () => {
      const did = encodeJwkJcsPubDidKey(exampleP256Jwk);
      const multibase = did.slice('did:key:'.length);
      const vm = await didKeyDriver.get({did: `${did}#${multibase}`});
      expect(vm.id).equal(`${did}#${multibase}`);
      expect(vm.type).equal('JsonWebKey2020');
    });

    it('falls through to the base driver for an Ed25519 (z6Mk) DID',
      async () => {
        const did =
          'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';
        const doc = await didKeyDriver.get({did});
        expect(doc.id).equal(did);
      });

    it('rejects a non-canonical jwk_jcs-pub DID', async () => {
      const did = encodeJwkJcsPubDidKey({...exampleP256Jwk, use: 'sig'});
      await rejects(didKeyDriver.get({did}));
    });
  });

  // End-to-end: a JWT signed by a P-256 key whose `iss` is that key's
  // jwk_jcs-pub DID verifies through did-jwt using the installed resolver. This
  // proves the requested-DID document exposes a usable verification key.
  describe('did-jwt round-trip', () => {
    it('verifies a JWT issued by a jwk_jcs-pub DID', async () => {
      const {publicKey, privateKey} = await generateKeyPair('ES256');
      const exported = await exportJWK(publicKey);
      const jwk = {crv: 'P-256', kty: 'EC', x: exported.x, y: exported.y};
      const did = canonicalJwkJcsPubDid({jwk});
      const multibase = did.slice('did:key:'.length);
      const jwt = await new SignJWT({sub: 'test'})
        .setProtectedHeader({alg: 'ES256', kid: `${did}#${multibase}`})
        .setIssuer(did)
        .sign(privateKey);
      const resolver = {
        resolve: async didUrl => ({
          didResolutionMetadata: {},
          didDocument: await didKeyDriver.get({did: didUrl}),
          didDocumentMetadata: {}
        })
      };
      const result = await verifyJWT(jwt, {resolver});
      expect(result.verified).equal(true);
      expect(result.issuer).equal(did);
    });

    // A JWT whose `iss` is a non-canonically-ordered jwk_jcs-pub DID verifies
    // when the holder-key resolver is opted into leniency — the presentation-
    // signing case issue 027 addresses.
    it('verifies a JWT issued by a non-canonical jwk_jcs-pub DID when opted in',
      async () => {
        const {publicKey, privateKey} = await generateKeyPair('ES256');
        const exported = await exportJWK(publicKey);
        // Serialize members in a non-canonical order, as the TWDIW wallet does.
        const jwk = {
          kty: 'EC', x: exported.x, y: exported.y, crv: 'P-256'
        };
        const jwkBytes = new TextEncoder().encode(JSON.stringify(jwk));
        const bytes = new Uint8Array(
          JWK_JCS_PUB_MULTICODEC_HEADER.length + jwkBytes.length);
        bytes.set(JWK_JCS_PUB_MULTICODEC_HEADER, 0);
        bytes.set(jwkBytes, JWK_JCS_PUB_MULTICODEC_HEADER.length);
        const did = `did:key:z${base58Encode(bytes)}`;
        const multibase = did.slice('did:key:'.length);
        const jwt = await new SignJWT({sub: 'test'})
          .setProtectedHeader({alg: 'ES256', kid: `${did}#${multibase}`})
          .setIssuer(did)
          .sign(privateKey);
        const resolver = {
          resolve: async didUrl => ({
            didResolutionMetadata: {},
            didDocument: await resolveJwkJcsPubDidKey(
              {id: didUrl, acceptNonCanonical: true}),
            didDocumentMetadata: {}
          })
        };
        const result = await verifyJWT(jwt, {resolver});
        expect(result.verified).equal(true);
        expect(result.issuer).equal(did);
      });
  });
});
