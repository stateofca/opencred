/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/*
 * Regression test for "preserve OIDC nonce/state through exchange completion".
 *
 * At completion the exchange's `oidc` object is rebuilt to set `code`. If
 * `nonce` (and `state`) are dropped during that rebuild, the fresh exchange
 * carries them but the completed one does not, producing nonce-less id_tokens
 * (IDX21320 in compliant RPs). `handleVerifiedPresentation`
 * (lib/workflows/common.js) is the shared completion path; it must carry
 * `state` and `nonce` from the prior exchange into the rebuilt `oidc`.
 */
import expect from 'expect.js';
import {handleVerifiedPresentation} from '../../lib/workflows/common.js';

const verifiablePresentation = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiablePresentation'],
  verifiableCredential: [{id: 'did:example:vc'}]
};

describe('handleVerifiedPresentation (completion preserves oidc)', () => {
  it('preserves nonce and state through completion', async () => {
    const exchange = {
      id: 'ex-1',
      sequence: 0,
      step: 'step1',
      oidc: {state: 'state-xyz', nonce: 'nonce-abc'}
    };
    const updated = await handleVerifiedPresentation({
      exchange, verifiablePresentation, vpToken: 'vp-token'
    });
    expect(updated.state).to.equal('complete');
    expect(updated.oidc.state).to.equal('state-xyz');
    expect(updated.oidc.nonce).to.equal('nonce-abc');
    // A fresh authorization code is always minted on completion.
    expect(updated.oidc.code).to.be.a('string');
    expect(updated.oidc.code.length).to.be.greaterThan(0);
  });

  it('records the verified presentation under the current step', async () => {
    const exchange = {
      id: 'ex-2', sequence: 2, step: 'theStep',
      oidc: {state: 's', nonce: 'n'}
    };
    const updated = await handleVerifiedPresentation({
      exchange, verifiablePresentation, vpToken: 'vp-token'
    });
    expect(updated.sequence).to.equal(3);
    expect(updated.variables.results.theStep.verifiablePresentation)
      .to.eql(verifiablePresentation);
    expect(updated.variables.results.theStep.vpToken).to.equal('vp-token');
  });

  it('does not throw when the exchange has no oidc block', async () => {
    const exchange = {id: 'ex-3', sequence: 0, step: 'step1'};
    const updated = await handleVerifiedPresentation({
      exchange, verifiablePresentation, vpToken: 'vp-token'
    });
    expect(updated.oidc.state).to.equal(undefined);
    expect(updated.oidc.nonce).to.equal(undefined);
    expect(updated.oidc.code).to.be.a('string');
  });
});
