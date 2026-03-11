/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {
  profileSupportsRequestUriMethodPost
} from '../../common/oid4vp-utils.js';

describe('profileSupportsRequestUriMethodPost', () => {

  it('should return true for OID4VP-combined', () => {
    expect(profileSupportsRequestUriMethodPost('OID4VP-combined')).to.be(true);
  });

  it('should return true for OID4VP-1.0', () => {
    expect(profileSupportsRequestUriMethodPost('OID4VP-1.0')).to.be(true);
  });

  it('should return true for 18013-7-Annex-D', () => {
    expect(profileSupportsRequestUriMethodPost('18013-7-Annex-D')).to.be(true);
  });

  it('should return true for 18013-7-Annex-C', () => {
    expect(profileSupportsRequestUriMethodPost('18013-7-Annex-C')).to.be(true);
  });

  it('should return false for OID4VP-draft18', () => {
    expect(profileSupportsRequestUriMethodPost('OID4VP-draft18')).to.be(false);
  });

  it('should return true for undefined profile', () => {
    expect(profileSupportsRequestUriMethodPost(undefined)).to.be(true);
  });
});
