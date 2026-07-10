/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

// Regression test for Google Wallet dc_api.jwt device-signature verification.
//
// Reconstructs DeviceAuthenticationBytes from a real captured Google Wallet
// vector and verifies the device COSE_Sign1 at the cose-kit layer (the same
// class the @auth0/mdl verifier uses). Proves the RFC 7638 thumbprint fix
// makes the signature verify, and that the previous buggy thumbprint does not.
//
// All values below are TEST USE ONLY: an ephemeral RP encryption key, a fake
// holder device key, and a one-time device signature. No secrets.

import {_calculateJwkThumbprint}
  from '../../../lib/workflows/common/oid4vp-shared.js';
import crypto from 'node:crypto';
import {DataItem} from '@auth0/mdl';
import expect from 'expect.js';
import {importJWK} from 'jose';
import {Sign1} from 'cose-kit';

const origin = 'https://opencred.cadmv.env.veres.dev';
const nonce = 'z19j8HooGBpjavTpefXJznsA3';
const docType = 'org.iso.18013.5.1.mDL';

// RP ephemeral encryption key (dc_api.jwt) — thumbprint goes in the handover.
const encPublicKeyJwk = {
  kty: 'EC',
  x: 'tFS-e5KXP2E6U7ZUiapU7kkBjVzSy43mt4ujUcu07Do',
  y: 'by6n7NLOtI_9KycnfJ6hTmnsa4-mg_23xB6KeKXc5Cw',
  crv: 'P-256',
  use: 'enc',
  alg: 'ECDH-ES',
  kid: 'urn:uuid:546b4d72-c10b-463b-972f-26af378bb903'
};

// Holder device public key (from the mdoc deviceKey).
const deviceKeyJwk = {
  kty: 'EC',
  crv: 'P-256',
  x: '3yit_rFBWX7I8BbK0D_Cb1Ia0AbiEz1NC9-DzGxX36Y',
  y: 'cjJv-_lj-Atf8Iczmrm8EvY1XmiG-EjW3y_EfXTZDxM'
};

// COSE_Sign1 protected headers {1: -7} (ES256), CBOR-encoded.
const protectedHeaders = new Uint8Array([161, 1, 38]);

// Device signature (raw COSE 64-byte r||s).
const deviceSignature = new Uint8Array([
  199, 85, 92, 84, 80, 4, 5, 214, 233, 222, 239, 190, 188, 252, 187, 72,
  99, 99, 155, 254, 151, 64, 253, 136, 185, 84, 85, 247, 28, 242, 179, 95,
  152, 60, 249, 176, 194, 152, 90, 162, 211, 114, 86, 171, 227, 177, 228, 141,
  222, 30, 109, 113, 170, 221, 48, 219, 29, 17, 10, 17, 222, 64, 79, 91
]);

/**
 * Reconstruct DeviceAuthenticationBytes for the OID4VP 1.0 DC API handover.
 *
 * @param {Uint8Array} thumbprint - JWK thumbprint of the RP enc key.
 * @returns {Uint8Array} #6.24(bstr .cbor DeviceAuthentication).
 */
function deviceAuthenticationBytes(thumbprint) {
  const handoverInfoBytes =
    DataItem.fromData([origin, nonce, thumbprint]).buffer;
  const handoverHash = new Uint8Array(
    crypto.createHash('sha256').update(handoverInfoBytes).digest());
  const sessionTranscript =
    [null, null, ['OpenID4VPDCAPIHandover', handoverHash]];
  // Empty device namespaces => tag-24(cbor({})).
  const deviceAuth = [
    'DeviceAuthentication', sessionTranscript, docType,
    DataItem.fromData(new Map())
  ];
  return DataItem.fromData(DataItem.fromData(deviceAuth)).buffer;
}

/**
 * Pre-fix buggy thumbprint (non-canonical JWK). Kept ONLY to prove the
 * regression is caught.
 *
 * @param {object} jwk - Public key JWK.
 * @returns {Uint8Array} SHA-256 of the non-canonical JSON.
 */
function buggyThumbprint(jwk) {
  const canonical = {};
  for(const p of ['kty', 'crv', 'x', 'y', 'e', 'n', 'use', 'alg', 'kid']) {
    if(jwk[p] !== undefined) {
      canonical[p] = jwk[p];
    }
  }
  return new Uint8Array(
    crypto.createHash('sha256')
      .update(JSON.stringify(canonical), 'utf8').digest());
}

describe('google-wallet device signature (captured vector)', () => {
  it('verifies with the RFC 7638 thumbprint', async () => {
    const deviceKey = await importJWK(deviceKeyJwk, 'ES256');
    const thumbprint = await _calculateJwkThumbprint(encPublicKeyJwk);
    const verified = await new Sign1(
      protectedHeaders, {}, deviceAuthenticationBytes(thumbprint),
      deviceSignature).verify(deviceKey);
    expect(verified).to.be(true);
  });

  it('does NOT verify with the old buggy thumbprint', async () => {
    const deviceKey = await importJWK(deviceKeyJwk, 'ES256');
    const thumbprint = buggyThumbprint(encPublicKeyJwk);
    const verified = await new Sign1(
      protectedHeaders, {}, deviceAuthenticationBytes(thumbprint),
      deviceSignature).verify(deviceKey);
    expect(verified).to.be(false);
  });
});
