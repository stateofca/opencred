/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  appleWalletTestEntry,
  googleWalletTestEntry
} from '../../fixtures/wallet-certificates.js';
import {
  OpenCredConfigSchema,
  WalletCertificateSchema
} from '../../../configs/config-utils.js';
import crypto from 'node:crypto';
import {expect} from 'chai';
import {logger} from '../../../lib/logger.js';
import sinon from 'sinon';

/** Expired EC P-256 leaf (1999); keys match the cert. Test-only. */
const expiredWalletPemBundle = {
  privateKeyPem:
`-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgkcG+bdc5Rd0jFcfB
kcGN0NJ7BkUuOxNSC8kZPabuIhWhRANCAAQ5OQQG2SFiX83KCo5yHvgtepfIOX+W
W8oGdXCjQc+QPTMsIE5t8jEfdeYMAXS5B0n9JTwjb4bLi1ZuHuTWI9Hv
-----END PRIVATE KEY-----
`,
  publicKeyPem:
`-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEOTkEBtkhYl/NygqOch74LXqXyDl/
llvKBnVwo0HPkD0zLCBObfIxH3XmDAF0uQdJ/SU8I2+Gy4tWbh7k1iPR7w==
-----END PUBLIC KEY-----
`,
  certificatePem:
`-----BEGIN CERTIFICATE-----
MIIBOjCB46ADAgECAhEA3pb63+LPc9XnXXGoyCwLJDAKBggqhkjOPQQDAjAeMRww
GgYDVQQDExNleHBpcmVkLXdhbGxldC10ZXN0MB4XDTk5MDEwMTAwMDAwMFoXDTk5
MDYwMTAwMDAwMFowHjEcMBoGA1UEAxMTZXhwaXJlZC13YWxsZXQtdGVzdDBZMBMG
ByqGSM49AgEGCCqGSM49AwEHA0IABDk5BAbZIWJfzcoKjnIe+C16l8g5f5ZbygZ1
cKNBz5A9MywgTm3yMR915gwBdLkHSf0lPCNvhsuLVm4e5NYj0e+jAjAAMAoGCCqG
SM49BAMCA0YAMEMCH1zdBhm1UbIum5sjN1w9W+nMxzpNApvS7aTJwALXY+UCIDsm
G1WP/DSpusNBbDvuE/u29lPr0d80kbSeq008IKTk
-----END CERTIFICATE-----
`
};

describe('walletCertificates schema', () => {
  let warnStub;
  beforeEach(() => {
    warnStub = sinon.stub(logger, 'warn');
  });
  afterEach(() => {
    warnStub.restore();
  });

  it('parses a valid apple-wallet entry', () => {
    const parsed = WalletCertificateSchema.parse(appleWalletTestEntry);
    expect(parsed.wallet).to.equal('apple-wallet');
    expect(parsed.id).to.equal('apple-test-2026');
  });

  it('parses a valid google-wallet entry', () => {
    const parsed = WalletCertificateSchema.parse({
      ...appleWalletTestEntry,
      wallet: 'google-wallet',
      id: 'google-test-2026'
    });
    expect(parsed.wallet).to.equal('google-wallet');
  });

  it('parses apple-wallet and google-wallet entries together', () => {
    const parsed = OpenCredConfigSchema.parse({
      workflows: [],
      walletCertificates: [
        appleWalletTestEntry,
        {
          ...appleWalletTestEntry,
          wallet: 'google-wallet',
          id: 'google-test-2026'
        }
      ]
    });
    expect(parsed.walletCertificates).to.have.length(2);
    expect(parsed.walletCertificates[0].wallet).to.equal('apple-wallet');
    expect(parsed.walletCertificates[1].wallet).to.equal('google-wallet');
  });

  it('rejects an unknown wallet discriminator', () => {
    expect(() => WalletCertificateSchema.parse({
      ...appleWalletTestEntry,
      wallet: 'mystery-wallet'
    })).to.throw();
  });

  it('throws on duplicate id across entries', () => {
    expect(() => OpenCredConfigSchema.parse({
      workflows: [],
      walletCertificates: [appleWalletTestEntry, appleWalletTestEntry]
    })).to.throw(/duplicate id "apple-test-2026"/);
  });

  it('throws on unparseable certificatePem', () => {
    expect(() => OpenCredConfigSchema.parse({
      workflows: [],
      walletCertificates: [{
        ...appleWalletTestEntry,
        certificatePem: 'not-a-pem'
      }]
    })).to.throw(/invalid certificatePem/);
  });

  it('warns on SPKI ↔ publicKeyPem mismatch', () => {
    const {publicKey} = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256'
    });
    const wrongPubPem = publicKey.export({
      type: 'spki',
      format: 'pem'
    });
    OpenCredConfigSchema.parse({
      workflows: [],
      walletCertificates: [{
        ...appleWalletTestEntry,
        publicKeyPem: wrongPubPem
      }]
    });
    expect(warnStub.called).to.equal(true);
    const msg = warnStub.firstCall.args[0];
    expect(msg).to.include('apple-test-2026');
  });

  it('warns when notAfter is in the past', () => {
    OpenCredConfigSchema.parse({
      workflows: [],
      walletCertificates: [{
        wallet: 'apple-wallet',
        id: 'expired-wallet-cert',
        type: 'ES256',
        ...expiredWalletPemBundle,
        displayName: 'past cert'
      }]
    });
    expect(warnStub.called).to.equal(true);
    const combined = warnStub.getCalls().map(c => c.args[0]).join('\n');
    expect(combined).to.include('expired-wallet-cert');
    expect(combined).to.include('in the past');
  });

  it('defaults walletCertificates to [] when missing', () => {
    const parsed = OpenCredConfigSchema.parse({workflows: []});
    expect(parsed.walletCertificates).to.deep.equal([]);
    expect(warnStub.called).to.equal(false);
  });

  it('leaves walletCertificates [] without warnings when empty', () => {
    const parsed = OpenCredConfigSchema.parse({
      workflows: [],
      walletCertificates: []
    });
    expect(parsed.walletCertificates).to.deep.equal([]);
    expect(warnStub.called).to.equal(false);
  });

  it('warns when google.rpMetadataBytes is not set', () => {
    OpenCredConfigSchema.parse({
      workflows: [],
      walletCertificates: [googleWalletTestEntry]
    });
    expect(warnStub.called).to.equal(true);
    const combined = warnStub.getCalls().map(c => c.args[0]).join('\n');
    expect(combined).to.include('google-test-2026');
    expect(combined).to.include('gw_rp_metadata_bytes');
  });

  it('does not warn when google.rpMetadataBytes is valid Base64URL', () => {
    OpenCredConfigSchema.parse({
      workflows: [],
      walletCertificates: [{
        ...googleWalletTestEntry,
        google: {rpMetadataBytes: 'abcDEF123_-'}
      }]
    });
    const combined = warnStub.getCalls().map(c => c.args[0]).join('\n');
    expect(combined).to.not.include('rpMetadataBytes');
  });

  it('warns when google.rpMetadataBytes is not valid Base64URL', () => {
    OpenCredConfigSchema.parse({
      workflows: [],
      walletCertificates: [{
        ...googleWalletTestEntry,
        google: {rpMetadataBytes: 'not valid!!'}
      }]
    });
    expect(warnStub.called).to.equal(true);
    const combined = warnStub.getCalls().map(c => c.args[0]).join('\n');
    expect(combined).to.include('google-test-2026');
    expect(combined).to.include('Base64URL');
  });
});
