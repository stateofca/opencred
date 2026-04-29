/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  authorizationRequestForProfile,
  determineOid4VpHandlerForProfile,
  GoogleWalletRuntimeNotImplementedError
} from '../../../lib/workflows/common/oid4vp-dispatcher.js';
import {expect} from 'chai';
import {identifyProfile} from
  '../../../lib/workflows/common/identify-profile.js';

describe('profile=apple-wallet / google-wallet routing', () => {
  it('identifyProfile accepts apple-wallet', () => {
    const out = identifyProfile({profile: 'apple-wallet'});
    expect(out.profile).to.equal('apple-wallet');
    expect(out.responseMode).to.equal('dc_api');
  });

  it('identifyProfile accepts google-wallet with x509_hash', () => {
    const out = identifyProfile({profile: 'google-wallet'});
    expect(out.profile).to.equal('google-wallet');
    expect(out.responseMode).to.equal('dc_api');
    expect(out.clientIdScheme).to.equal('x509_hash');
  });

  it('identifyProfile falls back on unknown values', () => {
    const out = identifyProfile({profile: 'mystery-profile'});
    expect(out.profile).to.equal('OID4VP-combined');
  });

  it(
    'authorizationRequestForProfile throws 501 for google-wallet',
    async () => {
      let caught;
      try {
        await authorizationRequestForProfile({
          profile: 'google-wallet',
          responseMode: 'dc_api',
          workflow: {query: []},
          exchange: {id: 'x', variables: {}},
          requestUrl: '/x'
        });
      } catch(err) {
        caught = err;
      }
      expect(caught).to.be.instanceOf(
        GoogleWalletRuntimeNotImplementedError);
      expect(caught.statusCode).to.equal(501);
      expect(caught.errorCode).to.equal('GOOGLE_WALLET_NOT_IMPLEMENTED');
    });

  it('determineOid4VpHandlerForProfile maps apple-wallet to Annex C handler',
    () => {
      const name = determineOid4VpHandlerForProfile('apple-wallet', {});
      expect(name).to.equal('18013-7-annex-c');
    });
});
