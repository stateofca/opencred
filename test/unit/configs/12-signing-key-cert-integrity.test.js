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

// A matched EC P-256 key pair that does NOT belong to the apple-wallet
// fixture's certificate — the production incident's shape: private and public
// keys that agree with each other but not with the certificate.
const foreign = crypto.generateKeyPairSync('ec', {namedCurve: 'P-256'});
const foreignPrivatePem = foreign.privateKey.export(
  {type: 'pkcs8', format: 'pem'});
const foreignPublicPem = foreign.publicKey.export(
  {type: 'spki', format: 'pem'});

/**
 * Join every logger.warning message emitted during a parse.
 *
 * @param {object} stub - The sinon stub wrapping logger.warning.
 * @returns {string} All warning messages, newline-joined.
 */
function warnings(stub) {
  return stub.getCalls().map(c => c.args[0]).join('\n');
}

describe('signing key certificate integrity', () => {
  let warnStub;
  beforeEach(() => {
    warnStub = sinon.stub(logger, 'warning');
  });
  afterEach(() => {
    warnStub.restore();
  });

  it('warns for a key pair that does not belong to the certificate', () => {
    const parsed = OpenCredConfigSchema.parse({
      workflows: [],
      signingKeys: [{
        type: 'ES256',
        id: 'incident-shape',
        purpose: ['authorization_request'],
        privateKeyPem: foreignPrivatePem,
        publicKeyPem: foreignPublicPem,
        certificatePem: appleWalletTestEntry.certificatePem
      }]
    });
    // Startup completes despite the mismatch: parse returns, does not throw.
    expect(parsed.signingKeys).to.have.length(1);
    const combined = warnings(warnStub);
    expect(combined).to.include('incident-shape');
    expect(combined).to.include('publicKeyPem does not match');
    expect(combined).to.include('privateKeyPem does not correspond');
  });

  it('does not warn when the signing key matches its certificate', () => {
    OpenCredConfigSchema.parse({
      workflows: [],
      signingKeys: [{
        type: 'ES256',
        id: 'matched-authz-key',
        purpose: ['authorization_request'],
        privateKeyPem: appleWalletTestEntry.privateKeyPem,
        publicKeyPem: appleWalletTestEntry.publicKeyPem,
        certificatePem: appleWalletTestEntry.certificatePem
      }]
    });
    const combined = warnings(warnStub);
    expect(combined).to.not.include('does not match');
    expect(combined).to.not.include('does not correspond');
  });

  it('warns when a wallet certificate key does not belong to its cert', () => {
    OpenCredConfigSchema.parse({
      workflows: [],
      walletCertificates: [{
        wallet: 'apple-wallet',
        id: 'mismatched-wallet',
        type: 'ES256',
        privateKeyPem: foreignPrivatePem,
        publicKeyPem: foreignPublicPem,
        certificatePem: appleWalletTestEntry.certificatePem,
        displayName: 'mismatched'
      }]
    });
    const combined = warnings(warnStub);
    expect(combined).to.include('mismatched-wallet');
    expect(combined).to.include('does not correspond');
  });
});
