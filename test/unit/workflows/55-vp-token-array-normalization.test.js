/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {normalizeVpTokenValue} from
  '../../../lib/workflows/common/dc-api-envelope.js';

describe('vp_token value normalization (OID4VP 1.0 array format)', () => {
  it('returns string values unchanged', () => {
    const result = normalizeVpTokenValue('abc123');
    expect(result).to.equal('abc123');
  });

  it('extracts first element from array values', () => {
    const result = normalizeVpTokenValue(['abc123', 'def456']);
    expect(result).to.equal('abc123');
  });

  it('handles single-element arrays', () => {
    const result = normalizeVpTokenValue(['abc123']);
    expect(result).to.equal('abc123');
  });

  it('throws on empty arrays', () => {
    expect(() => normalizeVpTokenValue([]))
      .to.throwError(/empty/);
  });
});
