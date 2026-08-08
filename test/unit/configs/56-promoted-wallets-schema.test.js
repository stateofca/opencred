/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  INHERITABLE_FIELDS,
  NativeWorkflowSchema
} from '../../../configs/config-utils.js';

import expect from 'expect.js';

const baseWorkflow = {
  type: 'native',
  clientId: 'promoted-wallets-test',
  clientSecret: 'shh',
  query: [{
    format: ['mso_mdoc'],
    fields: {'org.iso.18013.5.1': ['given_name']}
  }]
};

function parse(promotedWallets) {
  return NativeWorkflowSchema.safeParse({...baseWorkflow, promotedWallets});
}

describe('workflow promotedWallets', () => {
  it('is optional and absent when unset', () => {
    const result = NativeWorkflowSchema.safeParse(baseWorkflow);
    expect(result.success).to.be(true);
    expect(result.data.promotedWallets).to.be(undefined);
  });

  it('accepts a subset of known wallet identifiers', () => {
    const result = parse(['cadmv-ios', 'cadmv-android']);
    expect(result.success).to.be(true);
    expect(result.data.promotedWallets).to.eql(['cadmv-ios', 'cadmv-android']);
  });

  it('accepts an empty list (promote nothing)', () => {
    const result = parse([]);
    expect(result.success).to.be(true);
    expect(result.data.promotedWallets).to.eql([]);
  });

  it('rejects an unknown wallet identifier', () => {
    const result = parse(['not-a-wallet']);
    expect(result.success).to.be(false);
  });

  it('is an inheritable field', () => {
    expect(INHERITABLE_FIELDS).to.contain('promotedWallets');
  });
});
