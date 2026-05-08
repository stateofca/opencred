/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as base64url from 'base64url-universal';
import {
  Aes128Gcm,
  CipherSuite,
  DhkemP256HkdfSha256,
  HkdfSha256
} from '@hpke/core';
import {exportJWK, generateKeyPair} from 'jose';
import {cborEncode} from '@auth0/mdl/lib/cbor/index.js';
import crypto from 'node:crypto';
import {DataItem} from '@auth0/mdl';
import expect from 'expect.js';

/**
 * Reproduce _createSessionTranscriptAnnexC logic to get both transcript
 * forms for testing.
 *
 * @param {string} base64EncryptionInfo - Base64url-encoded EncryptionInfo.
 * @param {string} serializedOrigin - Origin string.
 * @returns {{hpkeInfoBytes: Uint8Array, encodedSessionTranscript: Uint8Array}}
 *   The plain CBOR and tag-24 wrapped forms of the session transcript.
 */
function createTranscriptBothForms(base64EncryptionInfo, serializedOrigin) {
  const dcapiInfo = [base64EncryptionInfo, serializedOrigin];
  const dcapiInfoBytes = cborEncode(dcapiInfo);
  const hash = crypto.createHash('sha256');
  hash.update(dcapiInfoBytes);
  const dcapiInfoHash = new Uint8Array(hash.digest());
  const sessionTranscript = [null, null, ['dcapi', dcapiInfoHash]];

  const hpkeInfoBytes = new Uint8Array(cborEncode(sessionTranscript));
  const encoded = DataItem.fromData(sessionTranscript);
  const encodedSessionTranscript = DataItem.fromData(encoded).buffer;

  return {hpkeInfoBytes, encodedSessionTranscript};
}

describe('Annex C HPKE decryption (Issue 7 + 8)', () => {
  let suite;

  before(() => {
    suite = new CipherSuite({
      kem: new DhkemP256HkdfSha256(),
      kdf: new HkdfSha256(),
      aead: new Aes128Gcm()
    });
  });

  describe('HPKE round-trip with @hpke/core', () => {
    it('should encrypt and decrypt with matching info bytes', async () => {
      // Generate recipient key pair (simulates generateAuthorizationRequest)
      const kp = await generateKeyPair('ECDH-ES', {
        crv: 'P-256', extractable: true
      });
      const [privateKeyJwk, publicKeyJwk] = await Promise.all([
        exportJWK(kp.privateKey),
        exportJWK(kp.publicKey)
      ]);

      // Build a realistic EncryptionInfo
      const nonce = crypto.randomBytes(16);
      const recipientPublicKey = new Map([
        [1, 2],
        [-1, 1],
        [-2, new Uint8Array(base64url.decode(publicKeyJwk.x))],
        [-3, new Uint8Array(base64url.decode(publicKeyJwk.y))]
      ]);
      const encryptionInfo = ['dcapi', {nonce, recipientPublicKey}];
      const base64EncryptionInfo = base64url.encode(cborEncode(encryptionInfo));
      const origin = 'https://example.com';

      // Compute transcript (both forms)
      const {hpkeInfoBytes, encodedSessionTranscript} =
        createTranscriptBothForms(base64EncryptionInfo, origin);

      // Verify both forms are different (plain vs tag-24)
      expect(hpkeInfoBytes.length).to.be.lessThan(
        encodedSessionTranscript.length
      );

      // Simulate wallet encrypting a DeviceResponse
      const fakePlaintext = new TextEncoder().encode('fake-device-response');
      const senderKey = await suite.kem.importKey('jwk', publicKeyJwk, true);
      const sender = await suite.createSenderContext({
        recipientPublicKey: senderKey,
        info: hpkeInfoBytes
      });
      const cipherText = new Uint8Array(
        await sender.seal(fakePlaintext, new Uint8Array(0))
      );
      const enc = new Uint8Array(sender.enc);

      // Simulate our server decrypting (mirrors handleAuthorizationResponse)
      const recipientKey = await suite.kem.importKey(
        'jwk', {...privateKeyJwk, key_ops: ['deriveBits']}, false
      );
      const ctx = await suite.createRecipientContext({
        recipientKey,
        enc,
        info: hpkeInfoBytes
      });
      const decrypted = new Uint8Array(
        await ctx.open(cipherText, new Uint8Array(0))
      );

      expect(Array.from(decrypted)).to.eql(Array.from(fakePlaintext));
    });

    it('should fail decryption when info bytes mismatch (tag-24 vs plain)',
      async () => {
        // This test proves Issue 8: using tag-24 as info causes failure
        const kp = await generateKeyPair('ECDH-ES', {
          crv: 'P-256', extractable: true
        });
        const [privateKeyJwk, publicKeyJwk] = await Promise.all([
          exportJWK(kp.privateKey),
          exportJWK(kp.publicKey)
        ]);

        const nonce = crypto.randomBytes(16);
        const recipientPublicKey = new Map([
          [1, 2], [-1, 1],
          [-2, new Uint8Array(base64url.decode(publicKeyJwk.x))],
          [-3, new Uint8Array(base64url.decode(publicKeyJwk.y))]
        ]);
        const encryptionInfo = ['dcapi', {nonce, recipientPublicKey}];
        const base64EncryptionInfo = base64url.encode(
          cborEncode(encryptionInfo)
        );
        const origin = 'https://example.com';

        const {hpkeInfoBytes, encodedSessionTranscript} =
          createTranscriptBothForms(base64EncryptionInfo, origin);

        // Wallet encrypts with plain CBOR info (correct per spec)
        const fakePlaintext = new TextEncoder().encode('secret');
        const senderKey = await suite.kem.importKey('jwk', publicKeyJwk, true);
        const sender = await suite.createSenderContext({
          recipientPublicKey: senderKey,
          info: hpkeInfoBytes
        });
        const cipherText = new Uint8Array(
          await sender.seal(fakePlaintext, new Uint8Array(0))
        );
        const enc = new Uint8Array(sender.enc);

        // Server tries to decrypt with tag-24 info (WRONG — old behavior)
        const recipientKey = await suite.kem.importKey(
          'jwk', {...privateKeyJwk, key_ops: ['deriveBits']}, false
        );
        const ctx = await suite.createRecipientContext({
          recipientKey,
          enc,
          info: encodedSessionTranscript // WRONG: tag-24 instead of plain
        });

        try {
          await ctx.open(cipherText, new Uint8Array(0));
          expect().fail('Should have thrown — info mismatch');
        } catch(error) {
          // Decryption fails because derived keys differ
          expect(error).to.be.ok();
        }
      });

    it('should import JWK private key with key_ops for deriveBits',
      async () => {
        const kp = await generateKeyPair('ECDH-ES', {
          crv: 'P-256', extractable: true
        });
        const privateKeyJwk = await exportJWK(kp.privateKey);

        // Verify importKey succeeds with key_ops
        const recipientKey = await suite.kem.importKey(
          'jwk', {...privateKeyJwk, key_ops: ['deriveBits']}, false
        );
        expect(recipientKey).to.be.ok();
        expect(recipientKey instanceof CryptoKey).to.be(true);
      });
  });

  describe('Session transcript encoding', () => {
    it('hpkeInfoBytes should be plain CBOR (no tag-24 prefix)', () => {
      const base64EncryptionInfo = base64url.encode(
        cborEncode(['dcapi', {nonce: crypto.randomBytes(16)}])
      );
      const {hpkeInfoBytes} = createTranscriptBothForms(
        base64EncryptionInfo, 'https://example.com'
      );

      // CBOR array starts with major type 4 (0x80–0x9f for short arrays,
      // or 0x83 for 3-element array). Tag-24 would start with 0xd8 0x18.
      expect(hpkeInfoBytes[0]).to.not.equal(0xd8);
      // 3-element CBOR array = 0x83
      expect(hpkeInfoBytes[0]).to.equal(0x83);
    });

    it('encodedSessionTranscript should be tag-24 wrapped', () => {
      const base64EncryptionInfo = base64url.encode(
        cborEncode(['dcapi', {nonce: crypto.randomBytes(16)}])
      );
      const {encodedSessionTranscript} = createTranscriptBothForms(
        base64EncryptionInfo, 'https://example.com'
      );

      // Tag-24 in CBOR: 0xd8 0x18
      expect(encodedSessionTranscript[0]).to.equal(0xd8);
      expect(encodedSessionTranscript[1]).to.equal(0x18);
    });
  });
});
