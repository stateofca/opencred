/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  resolvePendingDcApiRequest,
  responseJweKid,
  responseProtocol
} from '../../../lib/workflows/common/dc-api-response-resolver.js';

import expect from 'expect.js';

const appleEntry = {
  profile: 'apple-wallet',
  protocol: 'org-iso-mdoc',
  requestGroupId: 'g1',
  material: {hpkeRecipientPrivateKey: {kty: 'EC'}}
};
const googleEntry = {
  profile: 'google-wallet',
  protocol: 'openid4vp-v1-signed',
  requestGroupId: 'g1',
  kid: 'urn:uuid:google',
  material: {
    ephemeralKeyAgreementPrivateKey: {kty: 'EC', kid: 'urn:uuid:google'}
  }
};

function jwe({kid} = {}) {
  const header = Buffer.from(
    JSON.stringify({alg: 'ECDH-ES', enc: 'A128GCM', ...(kid ? {kid} : {})})
  ).toString('base64url');
  return `${header}.enckey.iv.ciphertext.tag`;
}

describe('responseProtocol', () => {
  it('returns a recognized DC API protocol', () => {
    expect(responseProtocol({protocol: 'org-iso-mdoc'}))
      .to.be('org-iso-mdoc');
    expect(responseProtocol({protocol: 'openid4vp-v1-signed'}))
      .to.be('openid4vp-v1-signed');
  });

  // A direct_post form body is not a DC API response and must not be routed as
  // one.
  it('returns null for a non-DC-API body', () => {
    expect(responseProtocol({vp_token: 'x', state: 'y'})).to.be(null);
    expect(responseProtocol({})).to.be(null);
    expect(responseProtocol()).to.be(null);
  });

  it('returns null for an unrecognized protocol string', () => {
    expect(responseProtocol({protocol: 'not-a-protocol'})).to.be(null);
  });
});

describe('responseJweKid', () => {
  it('reads the kid from a compact JWE protected header', () => {
    expect(responseJweKid({data: {response: jwe({kid: 'urn:uuid:abc'})}}))
      .to.be('urn:uuid:abc');
  });

  it('accepts the uppercase Response spelling', () => {
    expect(responseJweKid({data: {Response: jwe({kid: 'urn:uuid:abc'})}}))
      .to.be('urn:uuid:abc');
  });

  it('returns null when the header carries no kid', () => {
    expect(responseJweKid({data: {response: jwe()}})).to.be(null);
  });

  // Annex C carries base64url CBOR, not a JWE.
  it('returns null for a non-JWE payload', () => {
    expect(responseJweKid({data: {response: 'aGVsbG8gd29ybGQ'}})).to.be(null);
  });

  // Wallet-supplied input: must degrade rather than throw, so a malformed
  // header cannot fail a response that protocol matching already resolved.
  it('returns null rather than throwing for malformed input', () => {
    expect(responseJweKid({data: {response: 'a.b.c.d.e'}})).to.be(null);
    expect(responseJweKid({data: {response: '....'}})).to.be(null);
    expect(responseJweKid({data: {}})).to.be(null);
    expect(responseJweKid({})).to.be(null);
    expect(responseJweKid()).to.be(null);
  });
});

describe('resolvePendingDcApiRequest', () => {
  it('routes an Annex C response to the apple entry', () => {
    const {entry, matchedBy} = resolvePendingDcApiRequest({
      pending: [appleEntry, googleEntry],
      protocol: 'org-iso-mdoc'
    });
    expect(entry.profile).to.be('apple-wallet');
    expect(matchedBy).to.be('protocol');
  });

  it('routes a signed OID4VP response to the google entry', () => {
    const {entry} = resolvePendingDcApiRequest({
      pending: [appleEntry, googleEntry],
      protocol: 'openid4vp-v1-signed'
    });
    expect(entry.profile).to.be('google-wallet');
  });

  it('is insensitive to pending order', () => {
    const {entry} = resolvePendingDcApiRequest({
      pending: [googleEntry, appleEntry],
      protocol: 'org-iso-mdoc'
    });
    expect(entry.profile).to.be('apple-wallet');
  });

  it('throws a typed error when nothing matches', () => {
    let err;
    try {
      resolvePendingDcApiRequest({
        pending: [appleEntry], protocol: 'openid4vp-v1-signed'
      });
    } catch(e) {
      err = e;
    }
    expect(err).to.not.be(undefined);
    expect(err.errorCode).to.be('DC_API_RESPONSE_UNMATCHED');
    expect(err.statusCode).to.be(400);
    // The diagnostic value is naming what was pending versus what arrived.
    expect(err.message).to.contain('openid4vp-v1-signed');
    expect(err.message).to.contain('org-iso-mdoc');
  });

  it('throws a typed error when there are no pending requests at all', () => {
    let err;
    try {
      resolvePendingDcApiRequest({pending: [], protocol: 'org-iso-mdoc'});
    } catch(e) {
      err = e;
    }
    expect(err.errorCode).to.be('DC_API_RESPONSE_UNMATCHED');
    expect(err.message).to.contain('<none>');
  });

  it('proceeds on the protocol match when a kid disagrees', () => {
    const {entry, matchedBy} = resolvePendingDcApiRequest({
      pending: [googleEntry],
      protocol: 'openid4vp-v1-signed',
      jweKid: 'urn:uuid:someone-else'
    });
    expect(entry.profile).to.be('google-wallet');
    expect(matchedBy).to.be('protocol');
  });

  // Unreachable for a config that passed validateDcApiButtons, but it must fail
  // loudly rather than guess which key material to verify against. Constructed
  // directly here, bypassing config validation.
  describe('ambiguous pending set', () => {
    const dupA = {
      profile: 'google-wallet', protocol: 'openid4vp-v1-signed',
      kid: 'urn:uuid:a', material: {}
    };
    const dupB = {
      profile: '18013-7-Annex-D', protocol: 'openid4vp-v1-signed',
      kid: 'urn:uuid:b', material: {}
    };

    it('throws a typed error when narrowing is impossible', () => {
      let err;
      try {
        resolvePendingDcApiRequest({
          pending: [dupA, dupB], protocol: 'openid4vp-v1-signed'
        });
      } catch(e) {
        err = e;
      }
      expect(err.errorCode).to.be('DC_API_RESPONSE_AMBIGUOUS');
      expect(err.message).to.contain('google-wallet');
      expect(err.message).to.contain('18013-7-Annex-D');
      expect(err.message).to.contain('same wire format twice');
    });

    it('narrows by kid when the wallet echoed one', () => {
      const {entry, matchedBy} = resolvePendingDcApiRequest({
        pending: [dupA, dupB],
        protocol: 'openid4vp-v1-signed',
        jweKid: 'urn:uuid:b'
      });
      expect(entry.profile).to.be('18013-7-Annex-D');
      expect(matchedBy).to.be('kid');
    });

    it('narrows by the client-declared profile as a last resort', () => {
      const {entry, matchedBy} = resolvePendingDcApiRequest({
        pending: [dupA, dupB],
        protocol: 'openid4vp-v1-signed',
        declaredProfile: 'google-wallet'
      });
      expect(entry.profile).to.be('google-wallet');
      expect(matchedBy).to.be('declaredProfile');
    });
  });

  // A client-declared profile must never select an entry whose protocol
  // disagrees with the response, or a client could steer which stored key
  // material verifies a response it supplied.
  describe('declaredProfile is never authoritative', () => {
    it('cannot select an entry of a different protocol', () => {
      const {entry} = resolvePendingDcApiRequest({
        pending: [appleEntry, googleEntry],
        protocol: 'org-iso-mdoc',
        declaredProfile: 'google-wallet'
      });
      expect(entry.profile).to.be('apple-wallet');
    });

    it('cannot rescue a response whose protocol matches nothing', () => {
      let err;
      try {
        resolvePendingDcApiRequest({
          pending: [appleEntry],
          protocol: 'openid4vp-v1-signed',
          declaredProfile: 'apple-wallet'
        });
      } catch(e) {
        err = e;
      }
      expect(err.errorCode).to.be('DC_API_RESPONSE_UNMATCHED');
    });
  });
});
