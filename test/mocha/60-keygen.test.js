/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {importPKCS8, importSPKI} from 'jose';
import expect from 'expect.js';
import {generateP256SigningKey} from '../../common/generatePrime256v1Key.js';
import {generateRSA256SigningKey} from '../../common/generateRSA256Key.js';

describe('generatePrime256v1', function() {
  it('should generate valid key', async () => {
    const {privateKey, publicKey} = await generateP256SigningKey();
    const pub = await importSPKI(publicKey);
    const priv = await importPKCS8(privateKey);
    expect(publicKey.includes('-----BEGIN PUBLIC KEY-----')).to.equal(true);
    expect(publicKey.includes('-----END PUBLIC KEY-----')).to.equal(true);
    expect(privateKey.includes('-----BEGIN PRIVATE KEY-----')).to.equal(true);
    expect(privateKey.includes('-----END PRIVATE KEY-----')).to.equal(true);
    expect(pub).to.be.a('object');
    expect(priv).to.be.a('object');
  });
});

describe('generateRSA256', function() {
  it('should generate valid key', async () => {
    const {privateKey, publicKey} = await generateRSA256SigningKey();
    const pub = await importSPKI(publicKey);
    const priv = await importPKCS8(privateKey);
    expect(publicKey.includes('-----BEGIN PUBLIC KEY-----')).to.equal(true);
    expect(publicKey.includes('-----END PUBLIC KEY-----')).to.equal(true);
    expect(privateKey.includes('-----BEGIN PRIVATE KEY-----')).to.equal(true);
    expect(privateKey.includes('-----END PRIVATE KEY-----')).to.equal(true);
    expect(pub).to.be.a('object');
    expect(priv).to.be.a('object');
  });
});
