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

const credentialWithStatus = (statusListIndex, statusPurpose) => ({
  issuer: ISSUER,
  credentialStatus: {
    type: 'StatusList2021Entry',
    statusListCredential: STATUS_URL,
    statusListIndex,
    ...(statusPurpose ? {statusPurpose} : {})
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

  it('fails when the statusListCredential URL is missing', async () => {
    const credential = {
      issuer: ISSUER,
      credentialStatus: {
        type: 'StatusList2021Entry', statusListIndex: REVOKED_INDEX}
    };
    const result = await verifyUtils.checkStatus({credential});
    expect(result.verified).to.be(false);
    expect(result.errors[0]).to.contain('Missing statusListCredential');
  });

  it('fails when the status list URL is not https', async () => {
    const credential = {
      issuer: ISSUER,
      credentialStatus: {
        type: 'StatusList2021Entry',
        statusListCredential: 'http://issuer.example/status/1',
        statusListIndex: REVOKED_INDEX
      }
    };
    const result = await verifyUtils.checkStatus({credential});
    expect(result.verified).to.be(false);
    expect(result.errors[0]).to.contain('https');
  });

  it('fails when the status list fetch errors', async () => {
    getStub = sinon.stub(httpClient, 'get');
    getStub.withArgs(STATUS_URL).rejects(new Error('boom'));
    const result = await verifyUtils.checkStatus(
      {credential: credentialWithStatus(REVOKED_INDEX)});
    expect(result.verified).to.be(false);
    expect(result.errors[0]).to.contain('Unable to fetch');
    expect(result.errors[0]).to.contain('boom');
  });

  it('fails on a malformed status list envelope', async () => {
    getStub = sinon.stub(httpClient, 'get');
    getStub.withArgs(STATUS_URL).resolves({data: {nope: 1}});
    const result = await verifyUtils.checkStatus(
      {credential: credentialWithStatus(REVOKED_INDEX)});
    expect(result.verified).to.be(false);
    expect(result.errors[0]).to.contain('Unexpected status list');
  });

  it('fails when the status list JWT has no jku header', async () => {
    const {privateKey} = await generateKeyPair('ES256');
    const bytes = new Uint8Array(16);
    bytes[REVOKED_INDEX >> 3] |= 1 << (7 - (REVOKED_INDEX % 8));
    const encodedList = Buffer.from(gzipSync(Buffer.from(bytes)))
      .toString('base64url');
    const listJwt =
      await new SignJWT({vc: {credentialSubject: {encodedList}}})
        .setProtectedHeader({alg: 'ES256', kid: 'key-2'})
        .setIssuer(ISSUER)
        .sign(privateKey);
    getStub = sinon.stub(httpClient, 'get');
    getStub.withArgs(STATUS_URL).resolves({data: {statusList: listJwt}});
    const result = await verifyUtils.checkStatus(
      {credential: credentialWithStatus(REVOKED_INDEX)});
    expect(result.verified).to.be(false);
    expect(result.errors[0]).to.contain('jku');
  });

  it('fails when no JWKS key matches the JWT kid', async () => {
    const {publicKey, privateKey} = await generateKeyPair('ES256');
    const publicJwk = {
      ...await exportJWK(publicKey), kid: 'other-kid', alg: 'ES256'};
    const listJwt = await buildStatusList({privateKey});
    getStub = sinon.stub(httpClient, 'get');
    getStub.withArgs(STATUS_URL).resolves({data: {statusList: listJwt}});
    getStub.withArgs(JKU).resolves({data: {keys: [publicJwk]}});
    const result = await verifyUtils.checkStatus(
      {credential: credentialWithStatus(REVOKED_INDEX)});
    expect(result.verified).to.be(false);
    expect(result.errors[0]).to.contain('kid');
  });

  it('fails when the status list signature is tampered', async () => {
    const {publicKey, privateKey} = await generateKeyPair('ES256');
    const publicJwk = {
      ...await exportJWK(publicKey), kid: 'key-2', alg: 'ES256'};
    const listJwt = await buildStatusList({privateKey});
    const [header, body, sig] = listJwt.split('.');
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    const tampered = `${header}.${body}.${flipped}`;
    getStub = sinon.stub(httpClient, 'get');
    getStub.withArgs(STATUS_URL).resolves({data: {statusList: tampered}});
    getStub.withArgs(JKU).resolves({data: {keys: [publicJwk]}});
    const result = await verifyUtils.checkStatus(
      {credential: credentialWithStatus(REVOKED_INDEX)});
    expect(result.verified).to.be(false);
    expect(result.errors[0]).to.contain('signature');
  });

  it('fails closed on an out-of-range statusListIndex', async () => {
    await stubEndpoints();
    const result = await verifyUtils.checkStatus(
      {credential: credentialWithStatus(100000)});
    expect(result.verified).to.be(false);
    expect(result.errors[0]).to.contain('out of range');
  });

  it('fails closed on a non-integer statusListIndex', async () => {
    await stubEndpoints();
    const result = await verifyUtils.checkStatus(
      {credential: credentialWithStatus('not-a-number')});
    expect(result.verified).to.be(false);
  });

  it('handles an array-form credentialStatus (revoked)', async () => {
    await stubEndpoints();
    const credential = {
      issuer: ISSUER,
      credentialStatus: [{
        type: 'StatusList2021Entry',
        statusListCredential: STATUS_URL,
        statusListIndex: REVOKED_INDEX
      }]
    };
    const result = await verifyUtils.checkStatus({credential});
    expect(result.verified).to.be(false);
  });

  it('fails when the entry purpose does not match the list purpose',
    async () => {
      await stubEndpoints({statusPurpose: 'suspension'});
      const result = await verifyUtils.checkStatus(
        {credential: credentialWithStatus(CLEAR_INDEX, 'revocation')});
      expect(result.verified).to.be(false);
      expect(result.errors[0]).to.contain('purpose');
    });

  it('verifies a suspension-list credential whose bit is clear', async () => {
    await stubEndpoints({statusPurpose: 'suspension'});
    const result = await verifyUtils.checkStatus(
      {credential: credentialWithStatus(CLEAR_INDEX)});
    expect(result.verified).to.be(true);
  });
});
