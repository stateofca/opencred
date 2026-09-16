/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/*
 * When the user declines to share, the wallet returns an OAuth error (e.g.
 * `access_denied`) to the response endpoint instead of a vp_token.
 * `handleAuthorizationResponse` must treat that as a failed (invalid) exchange
 * with the error recorded — after validating `state` — rather than falling
 * through to vp_token extraction.
 */
import expect from 'expect.js';
import {
  handleAuthorizationResponse
} from '../../../lib/workflows/profiles/native-oid4vp-standard.js';

function buildExchange({step = 'default', state = 's1'} = {}) {
  return {
    id: 'ex-1',
    step,
    sequence: 0,
    variables: {
      authorizationRequest: {
        response_mode: 'direct_post',
        state
      }
    }
  };
}

describe('native-oid4vp-standard deny-consent handling', () => {
  it('marks the exchange invalid when the wallet returns an error',
    async () => {
      const exchange = buildExchange();
      const {updatedExchange} = await handleAuthorizationResponse({
        workflow: {},
        exchange,
        responseBody: {error: 'access_denied', state: 's1'}
      });
      expect(updatedExchange.state).to.equal('invalid');
      expect(updatedExchange.sequence).to.equal(1);
      expect(updatedExchange.variables.results.default.errors)
        .to.eql(['access_denied']);
    });

  it('records the error under the current step', async () => {
    const exchange = buildExchange({step: 'theStep'});
    const {updatedExchange} = await handleAuthorizationResponse({
      workflow: {},
      exchange,
      responseBody: {error: 'access_denied', state: 's1'}
    });
    expect(updatedExchange.variables.results.theStep.errors)
      .to.eql(['access_denied']);
  });

  it('throws when the returned state does not match', async () => {
    const exchange = buildExchange({state: 's1'});
    let threw = false;
    try {
      await handleAuthorizationResponse({
        workflow: {},
        exchange,
        responseBody: {error: 'access_denied', state: 'WRONG'}
      });
    } catch(e) {
      threw = true;
      expect(e.message).to.contain('state');
    }
    expect(threw).to.equal(true);
  });
});
