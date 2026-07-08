/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {exportJWK, generateKeyPair, SignJWT} from 'jose';
import expect from 'expect.js';
import {gzipSync} from 'node:zlib';
import {httpClient} from '@digitalbazaar/http-client';
import {verifyUtils} from '../../common/utils.js';

const ISSUER = 'did:key:zStatusListIssuerExample00000000000000000000000000';
const STATUS_URL = 'https://issuer.example/status/1';
const JKU = 'https://issuer.example/.well-known/jwks.json';
const REVOKED_INDEX = 5;
const CLEAR_INDEX = 9;

// Build a StatusList2021 bitstring with REVOKED_INDEX set (MSB-first, per
// spec), gzip + base64url it, and sign the wrapping status-list JWT with an
// ES256 key published at `jku` (TWDIW signs status lists with a jku key, not
// the iss did:key).
const buildStatusList = async ({privateKey, statusPurpose}) => {
  const bytes = new Uint8Array(16);
  bytes[REVOKED_INDEX >> 3] |= 1 << (7 - (REVOKED_INDEX % 8));
  const encodedList = Buffer.from(gzipSync(Buffer.from(bytes)))
    .toString('base64url');
  return new SignJWT({vc: {credentialSubject: {encodedList, statusPurpose}}})
    .setProtectedHeader({alg: 'ES256', kid: 'key-2', jku: JKU})
    .setIssuer(ISSUER)
    .sign(privateKey);
};

const credentialWithStatus = statusListIndex => ({
  issuer: ISSUER,
  credentialStatus: {
    type: 'StatusList2021Entry',
    statusListCredential: STATUS_URL,
    statusListIndex
  }
});

describe('StatusList2021Entry credential status', () => {
  let getStub;

  const stubEndpoints = async ({statusPurpose = 'revocation'} = {}) => {
    const {publicKey, privateKey} = await generateKeyPair('ES256');
    const publicJwk = {
      ...await exportJWK(publicKey), kid: 'key-2', alg: 'ES256'};
    const listJwt = await buildStatusList({privateKey, statusPurpose});
    getStub = sinon.stub(httpClient, 'get');
    getStub.withArgs(STATUS_URL).resolves({data: {statusList: listJwt}});
    getStub.withArgs(JKU).resolves({data: {keys: [publicJwk]}});
  };

  afterEach(() => {
    sinon.restore();
  });

  it('reports a revoked credential as not verified', async () => {
    await stubEndpoints();
    const result = await verifyUtils.checkStatus(
      {credential: credentialWithStatus(REVOKED_INDEX)});
    expect(result.verified).to.be(false);
    expect(result.errors[0]).to.contain('revoked');
  });

  it('reports a suspended credential as not verified', async () => {
    await stubEndpoints({statusPurpose: 'suspension'});
    const result = await verifyUtils.checkStatus(
      {credential: credentialWithStatus(REVOKED_INDEX)});
    expect(result.verified).to.be(false);
    expect(result.errors[0]).to.contain('suspended');
  });

  it('verifies a credential whose index bit is clear', async () => {
    await stubEndpoints();
    const result = await verifyUtils.checkStatus(
      {credential: credentialWithStatus(CLEAR_INDEX)});
    expect(result.verified).to.be(true);
  });

  it('fails when the status list jku is not same-origin as the list URL',
    async () => {
      const {publicKey, privateKey} = await generateKeyPair('ES256');
      const publicJwk =
        {...await exportJWK(publicKey), kid: 'key-2', alg: 'ES256'};
      // sign with a jku on a DIFFERENT origin than statusListCredential
      const listJwt =
        await new SignJWT({vc: {credentialSubject: {encodedList: ''}}})
          .setProtectedHeader(
            {alg: 'ES256', kid: 'key-2', jku: 'https://evil.example/jwks'})
          .setIssuer(ISSUER)
          .sign(privateKey);
      getStub = sinon.stub(httpClient, 'get');
      getStub.withArgs(STATUS_URL).resolves({data: {statusList: listJwt}});
      getStub.withArgs('https://evil.example/jwks')
        .resolves({data: {keys: [publicJwk]}});
      const result = await verifyUtils.checkStatus(
        {credential: credentialWithStatus(REVOKED_INDEX)});
      expect(result.verified).to.be(false);
      expect(result.errors[0]).to.contain('same-origin');
    });

  it('fails when the status list iss does not match the credential issuer',
    async () => {
      const {publicKey, privateKey} = await generateKeyPair('ES256');
      const publicJwk =
        {...await exportJWK(publicKey), kid: 'key-2', alg: 'ES256'};
      const listJwt =
        await new SignJWT({vc: {credentialSubject: {encodedList: ''}}})
          .setProtectedHeader({alg: 'ES256', kid: 'key-2', jku: JKU})
          .setIssuer('did:key:zSomeOtherIssuer')
          .sign(privateKey);
      getStub = sinon.stub(httpClient, 'get');
      getStub.withArgs(STATUS_URL).resolves({data: {statusList: listJwt}});
      getStub.withArgs(JKU).resolves({data: {keys: [publicJwk]}});
      const result = await verifyUtils.checkStatus(
        {credential: credentialWithStatus(REVOKED_INDEX)});
      expect(result.verified).to.be(false);
      expect(result.errors[0]).to.contain('issuer');
    });
});
