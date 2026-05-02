/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  decodeProtectedHeader,
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importSPKI,
  jwtVerify
} from 'jose';
import expect from 'expect.js';

import {
  OID4VP_AUTHZ_REQ_JWT_TYP,
  signJarJwt
} from '../../../lib/workflows/common/jar-signing.js';

describe('jar-signing', () => {
  describe('OID4VP_AUTHZ_REQ_JWT_TYP', () => {
    it('matches RFC9101 / OID4VP JAR typ', () => {
      expect(OID4VP_AUTHZ_REQ_JWT_TYP).to.equal('oauth-authz-req+jwt');
    });
  });

  describe('signJarJwt', () => {
    it(
      'signs ES256 JWT with verifiable signature and expected header/payload',
      async () => {
        const {privateKey, publicKey} = await generateKeyPair('ES256');
        const privateKeyPem = await exportPKCS8(privateKey);
        const publicKeyPem = await exportSPKI(publicKey);
        const authorizationRequest = {
          client_id: 'https://rp.example',
          response_type: 'vp_token',
          nonce: 'abc'
        };
        const jwt = await signJarJwt({
          authorizationRequest,
          signingKey: {privateKeyPem, type: 'ES256'},
          kid: 'did:web:rp.example#key-1'
        });
        const publicCryptoKey = await importSPKI(publicKeyPem, 'ES256');
        const verified = await jwtVerify(jwt, publicCryptoKey);
        const {payload, protectedHeader} = verified;
        expect(protectedHeader.typ).to.equal(OID4VP_AUTHZ_REQ_JWT_TYP);
        expect(protectedHeader.alg).to.equal('ES256');
        expect(protectedHeader.kid).to.equal('did:web:rp.example#key-1');
        expect(protectedHeader).not.to.have.key('x5c');
        expect(payload.client_id).to.equal(authorizationRequest.client_id);
        expect(payload.response_type).to.equal(
          authorizationRequest.response_type);
        expect(payload.nonce).to.equal(authorizationRequest.nonce);
        expect(typeof payload.iat).to.equal('number');
        expect(typeof payload.exp).to.equal('number');
      });

    it('uses signingMetadata alg and x5c; omits kid when x5c present',
      async () => {
        const {privateKey, publicKey} = await generateKeyPair('ES256');
        const privateKeyPem = await exportPKCS8(privateKey);
        const publicKeyPem = await exportSPKI(publicKey);
        const x5c = ['bW9jaw==', 'bW9jazI='];
        const jwt = await signJarJwt({
          authorizationRequest: {state: 's'},
          signingKey: {privateKeyPem, type: 'ES256'},
          kid: 'ignored-for-header',
          signingMetadata: {
            alg: 'ES256',
            kid: 'meta-kid',
            x5c
          }
        });
        const header = decodeProtectedHeader(jwt);
        expect(header.alg).to.equal('ES256');
        expect(header).not.to.have.key('kid');
        expect(header.typ).to.equal(OID4VP_AUTHZ_REQ_JWT_TYP);
        expect(header.x5c).to.eql(x5c);
        const publicCryptoKey = await importSPKI(publicKeyPem, 'ES256');
        await jwtVerify(jwt, publicCryptoKey);
      });

    it('uses kid when signingMetadata has no x5c', async () => {
      const {privateKey, publicKey} = await generateKeyPair('ES256');
      const privateKeyPem = await exportPKCS8(privateKey);
      const publicKeyPem = await exportSPKI(publicKey);
      const jwt = await signJarJwt({
        authorizationRequest: {nonce: 'n'},
        signingKey: {privateKeyPem, type: 'ES256'},
        kid: 'fallback-kid',
        signingMetadata: {
          alg: 'ES256',
          kid: 'meta-kid'
        }
      });
      const header = decodeProtectedHeader(jwt);
      expect(header.kid).to.equal('meta-kid');
      expect(header).not.to.have.key('x5c');
      const publicCryptoKey = await importSPKI(publicKeyPem, 'ES256');
      await jwtVerify(jwt, publicCryptoKey);
    });

    it('omits x5c when signingMetadata.x5c is empty or absent', async () => {
      const {privateKey, publicKey} = await generateKeyPair('ES256');
      const privateKeyPem = await exportPKCS8(privateKey);
      const publicKeyPem = await exportSPKI(publicKey);
      const publicCryptoKey = await importSPKI(publicKeyPem, 'ES256');

      const jwtEmpty = await signJarJwt({
        authorizationRequest: {a: 1},
        signingKey: {privateKeyPem, type: 'ES256'},
        kid: 'k',
        signingMetadata: {alg: 'ES256', kid: 'k2', x5c: []}
      });
      expect(decodeProtectedHeader(jwtEmpty)).not.to.have.key('x5c');
      await jwtVerify(jwtEmpty, publicCryptoKey);

      const jwtAbsent = await signJarJwt({
        authorizationRequest: {a: 1},
        signingKey: {privateKeyPem, type: 'ES256'},
        kid: 'k',
        signingMetadata: {alg: 'ES256', kid: 'k2'}
      });
      expect(decodeProtectedHeader(jwtAbsent)).not.to.have.key('x5c');
      await jwtVerify(jwtAbsent, publicCryptoKey);
    });

    it('throws clear errors for missing authorizationRequest, signingKey, kid',
      async () => {
        const {privateKey} = await generateKeyPair('ES256');
        const privateKeyPem = await exportPKCS8(privateKey);
        const signingKey = {privateKeyPem, type: 'ES256'};

        let err1;
        try {
          await signJarJwt({signingKey, kid: 'k'});
        } catch(e) {
          err1 = e;
        }
        expect(err1).to.be.an(Error);
        expect(err1.message).to.match(
          /signJarJwt: authorizationRequest is required/);

        let err2;
        try {
          await signJarJwt({authorizationRequest: {}, kid: 'k'});
        } catch(e) {
          err2 = e;
        }
        expect(err2).to.be.an(Error);
        expect(err2.message).to.match(/signJarJwt: signingKey is required/);

        let err3;
        try {
          await signJarJwt({authorizationRequest: {}, signingKey});
        } catch(e) {
          err3 = e;
        }
        expect(err3).to.be.an(Error);
        expect(err3.message).to.match(/signJarJwt: kid is required/);
      });
  });
});
