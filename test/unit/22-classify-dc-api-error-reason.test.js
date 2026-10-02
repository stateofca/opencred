/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  classifyDcApiErrorReason,
  DC_API_ERROR_REASON,
  DC_API_ERROR_REASON_RULES
} from '../../common/dcApiErrorReason.js';
import expect from 'expect.js';

describe('classifyDcApiErrorReason', () => {
  it('returns "other" for a non-string message', () => {
    expect(classifyDcApiErrorReason(undefined)).to.equal('other');
    expect(classifyDcApiErrorReason(null)).to.equal('other');
    expect(classifyDcApiErrorReason(42)).to.equal('other');
    expect(classifyDcApiErrorReason({})).to.equal('other');
  });

  it('returns "other" for an empty string', () => {
    expect(classifyDcApiErrorReason('')).to.equal('other');
  });

  it('returns "other" for a message no seed rule matches', () => {
    expect(classifyDcApiErrorReason('something unexpected happened'))
      .to.equal('other');
  });

  // The real Chrome/Edge `NetworkError` strings are learned in UAT (spec
  // Phase 1) and only then added to the seed rules. Until then the seed set is
  // empty by design, so no guessed prod string ships. The matching mechanism
  // is proven below with injected rules instead.
  it('ships an empty seed rule set until UAT strings are learned', () => {
    expect(DC_API_ERROR_REASON_RULES).to.be.an('array');
    expect(DC_API_ERROR_REASON_RULES.length).to.equal(0);
  });

  describe('substring matching (with injected rules)', () => {
    const rules = [
      {match: 'no matching provider', reason: DC_API_ERROR_REASON.NO_PROVIDER},
      {match: 'failed to fetch', reason: DC_API_ERROR_REASON.REQUEST_FETCH},
      {match: 'connection', reason: DC_API_ERROR_REASON.TRANSPORT}
    ];

    it('maps a known substring to its reason', () => {
      expect(classifyDcApiErrorReason(
        'Error: no matching provider was found', {rules}))
        .to.equal('no-provider');
    });

    it('matches case-insensitively', () => {
      expect(classifyDcApiErrorReason('FAILED TO FETCH envelope', {rules}))
        .to.equal('request-fetch');
    });

    it('returns the first matching rule in order', () => {
      // Contains both 'failed to fetch' and 'connection'; the earlier rule
      // wins, so ordering is significant.
      expect(classifyDcApiErrorReason(
        'failed to fetch over a bad connection', {rules}))
        .to.equal('request-fetch');
    });

    it('returns "other" when no injected rule matches', () => {
      expect(classifyDcApiErrorReason('totally different', {rules}))
        .to.equal('other');
    });
  });
});
