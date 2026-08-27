/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {_calculateJwkThumbprint}
  from '../../../lib/workflows/common/oid4vp-shared.js';
import {calculateJwkThumbprint} from 'jose';
import expect from 'expect.js';

// EC public key (TEST USE ONLY) with non-canonical members.
const encKeyWithExtras = {
  kty: 'EC',
  x: 'tFS-e5KXP2E6U7ZUiapU7kkBjVzSy43mt4ujUcu07Do',
  y: 'by6n7NLOtI_9KycnfJ6hTmnsa4-mg_23xB6KeKXc5Cw',
  crv: 'P-256',
  use: 'enc',
  alg: 'ECDH-ES',
  kid: 'urn:uuid:546b4d72-c10b-463b-972f-26af378bb903'
};

// Same key, only the RFC 7638 required members.
const encKeyBare = {
  kty: 'EC',
  x: 'tFS-e5KXP2E6U7ZUiapU7kkBjVzSy43mt4ujUcu07Do',
  y: 'by6n7NLOtI_9KycnfJ6hTmnsa4-mg_23xB6KeKXc5Cw',
  crv: 'P-256'
};

describe('_calculateJwkThumbprint (RFC 7638)', () => {
  it('returns a 32-byte Uint8Array', async () => {
    const thumbprint = await _calculateJwkThumbprint(encKeyBare);
    expect(thumbprint instanceof Uint8Array).to.be(true);
    expect(thumbprint.length).to.be(32);
  });

  it('matches jose.calculateJwkThumbprint (raw bytes)', async () => {
    const actual = await _calculateJwkThumbprint(encKeyBare);
    const expectedBytes = new Uint8Array(
      Buffer.from(await calculateJwkThumbprint(encKeyBare, 'sha256'),
        'base64url'));
    expect(Array.from(actual)).to.eql(Array.from(expectedBytes));
  });

  it('ignores non-canonical members (use/alg/kid)', async () => {
    const withExtras = await _calculateJwkThumbprint(encKeyWithExtras);
    const bare = await _calculateJwkThumbprint(encKeyBare);
    expect(Array.from(withExtras)).to.eql(Array.from(bare));
  });
});
