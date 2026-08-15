/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  INHERITABLE_FIELDS,
  NativeWorkflowSchema,
  OID4VP_PROFILE_VALUES,
  OptionsSchema
} from '../../../configs/config-utils.js';

import expect from 'expect.js';

const baseWorkflow = {
  type: 'native',
  clientId: 'override-options-test',
  clientSecret: 'shh',
  query: [{
    format: ['mso_mdoc'],
    fields: {'org.iso.18013.5.1': ['given_name']}
  }]
};

describe('workflow oid4vpProfile', () => {
  const parse = oid4vpProfile =>
    NativeWorkflowSchema.safeParse({...baseWorkflow, oid4vpProfile});

  it('is optional and absent when unset', () => {
    const result = NativeWorkflowSchema.safeParse(baseWorkflow);
    expect(result.success).to.be(true);
    expect(result.data.oid4vpProfile).to.be(undefined);
  });

  it('accepts every deployment-wide profile value', () => {
    for(const profile of OID4VP_PROFILE_VALUES) {
      const result = parse(profile);
      expect(result.success).to.be(true);
      expect(result.data.oid4vpProfile).to.equal(profile);
    }
  });

  it('accepts the same set of profiles as options.OID4VPdefault', () => {
    // The global option must accept exactly the per-workflow set; a value
    // rejected by one but not the other would break the "same set" guarantee.
    for(const profile of OID4VP_PROFILE_VALUES) {
      expect(OptionsSchema.safeParse({OID4VPdefault: profile}).success)
        .to.be(true);
      expect(parse(profile).success).to.be(true);
    }
  });

  it('rejects a profile outside the set', () => {
    expect(parse('OID4VP-HAIP-1.0').success).to.be(false);
    expect(parse('not-a-profile').success).to.be(false);
  });

  it('is an inheritable field', () => {
    expect(INHERITABLE_FIELDS).to.contain('oid4vpProfile');
  });
});

describe('workflow acceptNonCanonicalJwkJcsPub', () => {
  const parse = acceptNonCanonicalJwkJcsPub =>
    NativeWorkflowSchema.safeParse(
      {...baseWorkflow, acceptNonCanonicalJwkJcsPub});

  it('is optional and absent when unset', () => {
    const result = NativeWorkflowSchema.safeParse(baseWorkflow);
    expect(result.success).to.be(true);
    expect(result.data.acceptNonCanonicalJwkJcsPub).to.be(undefined);
  });

  it('accepts a boolean', () => {
    const result = parse(true);
    expect(result.success).to.be(true);
    expect(result.data.acceptNonCanonicalJwkJcsPub).to.be(true);
  });

  it('rejects a non-boolean', () => {
    expect(parse('yes').success).to.be(false);
  });

  it('defaults to false deployment-wide', () => {
    const result = OptionsSchema.safeParse({});
    expect(result.success).to.be(true);
    expect(result.data.acceptNonCanonicalJwkJcsPub).to.be(false);
  });

  it('is an inheritable field', () => {
    expect(INHERITABLE_FIELDS).to.contain('acceptNonCanonicalJwkJcsPub');
  });
});
