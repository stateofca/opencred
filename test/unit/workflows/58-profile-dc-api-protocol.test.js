/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  ANNEX_C_DC_API_PROTOCOL,
  DC_API_OID4VP_ACCEPTED_PROTOCOLS,
  DC_API_OID4VP_PROTOCOLS,
  dcApiProtocolForProfile,
  isDcApiProfile,
  PROFILE_DC_API_PROTOCOL
} from '../../../lib/workflows/common/dc-api-envelope.js';
import {identifyProfile} from
  '../../../lib/workflows/common/identify-profile.js';

import expect from 'expect.js';

// Profiles that deliberately have no DC API protocol: they emit a signed JAR
// JWT, not a DC API wire envelope.
const NON_DC_API_PROFILES = [
  '18013-7-Annex-B',
  'OID4VP-1.0',
  'OID4VP-draft18',
  'OID4VP-combined'
];

describe('PROFILE_DC_API_PROTOCOL', () => {
  it('maps every entry to an accepted DC API protocol', () => {
    for(const [profile, protocol] of
      Object.entries(PROFILE_DC_API_PROTOCOL)) {
      expect(DC_API_OID4VP_ACCEPTED_PROTOCOLS).to.contain(protocol);
      expect(profile).to.be.a('string');
    }
  });

  it('puts the Annex C lane on org-iso-mdoc', () => {
    for(const profile of [
      '18013-7-Annex-C', '18013-7-Annex-C-spruceid',
      'apple-wallet', 'cadmv-ios'
    ]) {
      expect(dcApiProtocolForProfile({profile}))
        .to.be(ANNEX_C_DC_API_PROTOCOL);
    }
  });

  it('puts the Annex D lane on openid4vp-v1-signed', () => {
    for(const profile of [
      '18013-7-Annex-D', '18013-7-Annex-D-spruceid',
      'cadmv-android', 'google-wallet', 'OID4VP-HAIP-1.0'
    ]) {
      expect(dcApiProtocolForProfile({profile}))
        .to.be(DC_API_OID4VP_PROTOCOLS.v1Signed);
    }
  });

  it('returns null for profiles that emit a JAR JWT, not a DC API ' +
    'envelope', () => {
    for(const profile of NON_DC_API_PROFILES) {
      expect(dcApiProtocolForProfile({profile})).to.be(null);
      expect(isDcApiProfile({profile})).to.be(false);
    }
  });

  it('returns null rather than throwing for absent or non-string input', () => {
    expect(dcApiProtocolForProfile({})).to.be(null);
    expect(dcApiProtocolForProfile()).to.be(null);
    expect(dcApiProtocolForProfile({profile: undefined})).to.be(null);
    expect(dcApiProtocolForProfile({profile: 42})).to.be(null);
    expect(isDcApiProfile({profile: 'not-a-real-profile'})).to.be(false);
  });

  // The map is keyed by the profile as RESOLVED by identifyProfile, so any
  // requested name that redirects must land on a mapped profile. Guards
  // against a redirect target being added without a map entry.
  describe('resolution through identifyProfile', () => {
    const walletLaneProfiles = [
      'apple-wallet', 'google-wallet', 'cadmv-ios', 'cadmv-android',
      '18013-7-Annex-C', '18013-7-Annex-D'
    ];

    it('resolves DC API wallet profiles to mapped profiles without a ' +
      'namespace query', () => {
      for(const requested of walletLaneProfiles) {
        const {profile: resolved} = identifyProfile({
          profile: requested,
          workflow: {type: 'native'}
        });
        expect(dcApiProtocolForProfile({profile: resolved})).to.not.be(null);
      }
    });

    it('resolves DC API wallet profiles to mapped profiles WITH a ' +
      'namespace query (spruceid redirect)', () => {
      const workflow = {
        type: 'native',
        dcApiNamespaceQuery: {'org.iso.18013.5.1': ['given_name']}
      };
      for(const requested of walletLaneProfiles) {
        const {profile: resolved} = identifyProfile({profile: requested,
          workflow});
        expect(dcApiProtocolForProfile({profile: resolved})).to.not.be(null);
      }
    });

    it('redirects the Annex D lane to the spruceid handler when a namespace ' +
      'query is set, keeping the same protocol', () => {
      const workflow = {
        type: 'native',
        dcApiNamespaceQuery: {'org.iso.18013.5.1': ['given_name']}
      };
      const {profile: resolved} = identifyProfile({
        profile: '18013-7-Annex-D', workflow
      });
      expect(resolved).to.be('18013-7-Annex-D-spruceid');
      expect(dcApiProtocolForProfile({profile: resolved}))
        .to.be(DC_API_OID4VP_PROTOCOLS.v1Signed);
    });

    it('redirects the Annex C lane to the spruceid handler when a namespace ' +
      'query is set, keeping the same protocol', () => {
      const workflow = {
        type: 'native',
        dcApiNamespaceQuery: {'org.iso.18013.5.1': ['given_name']}
      };
      const {profile: resolved} = identifyProfile({
        profile: '18013-7-Annex-C', workflow
      });
      expect(resolved).to.be('18013-7-Annex-C-spruceid');
      expect(dcApiProtocolForProfile({profile: resolved}))
        .to.be(ANNEX_C_DC_API_PROTOCOL);
    });
  });

  // `18013-7-Annex-D` is the ONLY profile whose handler picks its DC API
  // protocol from the `signed` flag: `generateAuthorizationRequest` in
  // native-18013-7-annex-d.js emits openid4vp-v1-signed when signed is true and
  // openid4vp-v1-unsigned when it is false. Every other mapped profile ignores
  // the flag — the Annex C handler always builds an Annex C envelope,
  // cadmv-android/google-wallet/HAIP hardcode `signed: true` at the builder
  // call, and the spruceid handler branches only on whether the profile is the
  // Annex C variant (note the spruceid profiles resolve with signed: false, and
  // it makes no difference to what they emit).
  //
  // So this single assertion is what keeps `18013-7-Annex-D` single-protocol.
  // If it fails, that profile can emit two protocols, the response routing
  // in dc-api-response-resolver.js can no longer identify a request by protocol
  // alone, and the collision ban in validateDcApiButtons is no longer
  // sufficient. See the note on PROFILE_DC_API_PROTOCOL.
  describe('single-protocol-per-profile assumption', () => {
    it('resolves 18013-7-Annex-D with signed: true, so it always emits ' +
      'openid4vp-v1-signed and never the unsigned variant', () => {
      const resolved = identifyProfile({
        profile: '18013-7-Annex-D',
        workflow: {type: 'native'}
      });
      expect(resolved.profile).to.be('18013-7-Annex-D');
      expect(resolved.signed).to.be(true);
      expect(PROFILE_DC_API_PROTOCOL['18013-7-Annex-D'])
        .to.be(DC_API_OID4VP_PROTOCOLS.v1Signed);
      expect(PROFILE_DC_API_PROTOCOL['18013-7-Annex-D'])
        .to.not.be(DC_API_OID4VP_PROTOCOLS.v1Unsigned);
    });
  });
});
