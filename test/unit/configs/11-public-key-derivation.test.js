/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {appleWalletTestEntry} from '../../fixtures/wallet-certificates.js';
import crypto from 'node:crypto';
import {expect} from 'chai';
import {logger} from '../../../lib/logger.js';
import {OpenCredConfigSchema} from '../../../configs/config-utils.js';
import sinon from 'sinon';

// A signing key reusing the apple-wallet fixture's matched key/cert material
// (private key and certificate correspond); publicKeyPem omitted on purpose.
const signingKeyWithCert = {
  type: 'ES256',
  id: 'authz-signing-key',
  purpose: ['authorization_request'],
  privateKeyPem: appleWalletTestEntry.privateKeyPem,
  certificatePem: appleWalletTestEntry.certificatePem
};

/**
 * Normalize a public key PEM to SPKI DER so two encodings compare equal.
 *
 * @param {string} pem - A public key in PEM form.
 * @returns {Buffer} The SPKI DER encoding of the key.
 */
function spkiDer(pem) {
  return crypto.createPublicKey(pem).export({type: 'spki', format: 'der'});
}

describe('publicKeyPem derivation from certificate', () => {
  let warnStub;
  beforeEach(() => {
    warnStub = sinon.stub(logger, 'warning');
  });
  afterEach(() => {
    warnStub.restore();
  });

  it('derives a signing key publicKeyPem from its certificate', () => {
    const parsed = OpenCredConfigSchema.parse({
      workflows: [],
      signingKeys: [signingKeyWithCert]
    });
    const [key] = parsed.signingKeys;
    expect(key.publicKeyPem).to.be.a('string').and.include('PUBLIC KEY');
    // The derived key is the certificate's embedded public key.
    expect(spkiDer(key.publicKeyPem).equals(
      spkiDer(appleWalletTestEntry.publicKeyPem))).to.equal(true);
  });

  it('derives a wallet certificate publicKeyPem from its certificate', () => {
    const withoutPublicKey = {...appleWalletTestEntry};
    delete withoutPublicKey.publicKeyPem;
    const parsed = OpenCredConfigSchema.parse({
      workflows: [],
      walletCertificates: [withoutPublicKey]
    });
    const [entry] = parsed.walletCertificates;
    expect(spkiDer(entry.publicKeyPem).equals(
      spkiDer(appleWalletTestEntry.publicKeyPem))).to.equal(true);
  });

  it('leaves an explicitly supplied publicKeyPem untouched', () => {
    const parsed = OpenCredConfigSchema.parse({
      workflows: [],
      signingKeys: [{
        ...signingKeyWithCert,
        publicKeyPem: appleWalletTestEntry.publicKeyPem
      }]
    });
    expect(parsed.signingKeys[0].publicKeyPem).to.equal(
      appleWalletTestEntry.publicKeyPem);
  });

  it('rejects a signing key with neither certificate nor publicKeyPem', () => {
    expect(() => OpenCredConfigSchema.parse({
      workflows: [],
      signingKeys: [{
        type: 'ES256',
        id: 'no-cert-no-pub',
        purpose: ['id_token'],
        privateKeyPem: appleWalletTestEntry.privateKeyPem
      }]
    })).to.throw(/publicKeyPem is required/);
  });
});
