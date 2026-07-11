/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {OptionsSchema} from '../../../configs/config-utils.js';

describe('OptionsSchema - oid4vpDisplayLinkOnDesktop', () => {
  it('should default to false (launch link hidden on desktop)', () => {
    const options = OptionsSchema.parse({});
    expect(options.oid4vpDisplayLinkOnDesktop).to.be(false);
  });

  it('should allow overriding to true for debugging', () => {
    const options = OptionsSchema.parse({oid4vpDisplayLinkOnDesktop: true});
    expect(options.oid4vpDisplayLinkOnDesktop).to.be(true);
  });

  it('should reject non-boolean values', () => {
    const result = OptionsSchema.safeParse(
      {oid4vpDisplayLinkOnDesktop: 'yes'});
    expect(result.success).to.be(false);
  });
});
