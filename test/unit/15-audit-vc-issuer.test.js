/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {getVpTokenMetadata} from '../../common/audit.js';
import expect from 'expect.js';

// Encode a payload as an (unsigned) JWT. getVpTokenMetadata uses decodeJwt,
// which does not verify the signature, so a placeholder signature suffices.
const b64u = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = payload => `${b64u({alg: 'ES256', typ: 'JWT'})}.${b64u(payload)}.AAAA`;
// Build a VP-JWT whose `vp.verifiableCredential` holds the given VC payloads,
// each itself encoded as a VC-JWT.
const vpToken = vcPayloads =>
  jwt({vp: {verifiableCredential: vcPayloads.map(jwt)}});

const ISS = 'did:key:zDnaeyXNn6Xc8KZ9Yx1vJhRYV7Vvac7vZxbzb1234567890ab';
const OTHER = 'did:key:zDnaOtherIssuer000000000000000000000000000000000';

describe('getVpTokenMetadata - vc.issuer per W3C VC-JWT encoding', () => {
  it('accepts a VC-JWT that omits vc.issuer (iss is authoritative)', () => {
    const res = getVpTokenMetadata(
      vpToken([{iss: ISS, vc: {type: ['VerifiableCredential']}}]));
    expect(res.valid).to.be(true);
    expect(res.issuerDids).to.eql([ISS]);
  });

  it('accepts when vc.issuer (string) matches iss', () => {
    const res = getVpTokenMetadata(
      vpToken([{iss: ISS, vc: {issuer: ISS}}]));
    expect(res.valid).to.be(true);
    expect(res.issuerDids).to.eql([ISS]);
  });

  it('accepts when vc.issuer object id matches iss', () => {
    const res = getVpTokenMetadata(
      vpToken([{iss: ISS, vc: {issuer: {id: ISS}}}]));
    expect(res.valid).to.be(true);
    expect(res.issuerDids).to.eql([ISS]);
  });

  it('rejects when a present vc.issuer disagrees with iss', () => {
    const res = getVpTokenMetadata(
      vpToken([{iss: ISS, vc: {issuer: OTHER}}]));
    expect(res.valid).to.be(false);
  });

  it('rejects when iss is absent', () => {
    const res = getVpTokenMetadata(
      vpToken([{vc: {type: ['VerifiableCredential']}}]));
    expect(res.valid).to.be(false);
  });
});
