/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  computeX509HashClientId,
  parseCertificateChainPem
} from '../../../lib/workflows/common/wallet-certificates.js';

import {googleWalletTestEntry} from '../../fixtures/wallet-certificates.js';

import expect from 'expect.js';

describe('computeX509HashClientId', () => {
  it('produces x509_hash:<base64url> from DER cert', () => {
    const ders = parseCertificateChainPem(
      googleWalletTestEntry.certificatePem);
    const clientId = computeX509HashClientId(ders[0]);
    expect(clientId).to.match(/^x509_hash:[A-Za-z0-9_-]+$/);
    // Deterministic: same cert → same hash
    const clientId2 = computeX509HashClientId(ders[0]);
    expect(clientId).to.equal(clientId2);
  });

  it('throws if input is not Uint8Array', () => {
    expect(() => computeX509HashClientId('not a buffer'))
      .to.throwError(/Uint8Array/);
  });

  it('returns a value without base64 padding', () => {
    const ders = parseCertificateChainPem(
      googleWalletTestEntry.certificatePem);
    const clientId = computeX509HashClientId(ders[0]);
    expect(clientId).to.not.contain('=');
  });
});
