/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {_jwkToCoseKey} from
  '../../../lib/workflows/profiles/native-18013-7-annex-c.js';
import {cborEncode} from '@auth0/mdl/lib/cbor/index.js';
import expect from 'expect.js';

// Synthetic P-256 JWK (32 bytes each for x/y)
const testJwk = {
  kty: 'EC',
  crv: 'P-256',
  // 32 bytes of 0xAA base64url-encoded
  x: 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo',
  // 32 bytes of 0xBB base64url-encoded
  y: 'u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7s'
};

describe('COSE_Key encoding (RFC 9052 §7 compliance)', () => {
  it('_jwkToCoseKey output encodes with integer keys (not text strings)',
    () => {
      const coseKey = _jwkToCoseKey(testJwk);
      const encoded = cborEncode(coseKey);
      const hex = Buffer.from(encoded).toString('hex');

      // CBOR text string "-1" is 62 2d 31 — must NOT appear
      expect(hex).to.not.contain('622d31');
      // CBOR text string "-2" is 62 2d 32 — must NOT appear
      expect(hex).to.not.contain('622d32');
      // CBOR text string "-3" is 62 2d 33 — must NOT appear
      expect(hex).to.not.contain('622d33');
      // CBOR text string "1" is 61 31 — must NOT appear
      expect(hex).to.not.contain('6131');
    });

  it('_jwkToCoseKey output encodes x/y as byte strings (not arrays)', () => {
    const coseKey = _jwkToCoseKey(testJwk);
    const encoded = cborEncode(coseKey);
    const hex = Buffer.from(encoded).toString('hex');

    // CBOR byte string of 32 bytes starts with 58 20 (major type 2, length 32)
    const bstrPattern = '5820';
    const occurrences = hex.split(bstrPattern).length - 1;
    expect(occurrences).to.be.greaterThan(1);

    // CBOR array of 32 items: 98 20 (major type 4, length 32)
    expect(hex).to.not.contain('9820');
  });
});
