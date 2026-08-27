/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {identifyProfiles} from
  '../../../lib/workflows/common/identify-profile.js';

import expect from 'expect.js';

const workflow = {type: 'native'};

describe('identifyProfiles', () => {
  it('accepts a single string, yielding a one-element array so callers ' +
    'have one code path', () => {
    const results = identifyProfiles({profile: 'apple-wallet', workflow});
    expect(results.length).to.be(1);
    expect(results[0].profile).to.be('apple-wallet');
  });

  it('accepts an array, preserving requested order', () => {
    const results = identifyProfiles({
      profile: ['google-wallet', 'apple-wallet'], workflow
    });
    expect(results.map(r => r.profile))
      .to.eql(['google-wallet', 'apple-wallet']);
  });

  it('resolves each profile independently, keeping per-profile response ' +
    'mode and client id scheme', () => {
    const [apple, google] = identifyProfiles({
      profile: ['apple-wallet', 'google-wallet'], workflow
    });
    expect(apple.responseMode).to.be('dc_api');
    expect(google.responseMode).to.be('dc_api.jwt');
    expect(google.clientIdScheme).to.be('x509_hash');
  });

  it('never returns empty: an absent profile yields the default', () => {
    const results = identifyProfiles({workflow});
    expect(results.length).to.be(1);
    expect(results[0].profile).to.be.a('string');
  });

  it('deduplicates repeated names', () => {
    const results = identifyProfiles({
      profile: ['google-wallet', 'google-wallet'], workflow
    });
    expect(results.length).to.be(1);
  });

  // Two distinct requested names can redirect onto one resolved profile.
  // Putting the identical envelope on the wire twice is exactly what the
  // same-protocol collision ban exists to prevent.
  it('deduplicates names that redirect onto the same resolved profile', () => {
    const namespaceWorkflow = {
      type: 'native',
      dcApiNamespaceQuery: {'org.iso.18013.5.1': ['given_name']}
    };
    const results = identifyProfiles({
      profile: ['cadmv-android', '18013-7-Annex-D'],
      workflow: namespaceWorkflow
    });
    expect(results.length).to.be(1);
    expect(results[0].profile).to.be('18013-7-Annex-D-spruceid');
  });

  it('keeps first-seen order when deduplicating', () => {
    const results = identifyProfiles({
      profile: ['apple-wallet', 'google-wallet', 'apple-wallet'], workflow
    });
    expect(results.map(r => r.profile))
      .to.eql(['apple-wallet', 'google-wallet']);
  });
});
