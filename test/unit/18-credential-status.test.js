/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import * as sinon from 'sinon';
import {
  checkTwdiwStatusList2021, decodeStatusList, MAX_STATUS_LIST_BYTES,
  readStatusBit
} from '../../lib/credential-status/twdiw-status-list-2021.js';
import {exportJWK, generateKeyPair, SignJWT} from 'jose';
import {gunzipSync, gzipSync} from 'node:zlib';
import {checkStatus} from '../../lib/credential-status/index.js';
import expect from 'expect.js';
import {httpClient} from '@digitalbazaar/http-client';

const ISSUER = 'did:key:zStatusListIssuerExample00000000000000000000000000';
const STATUS_URL = 'https://issuer.example/status/1';
const JKU = 'https://issuer.example/.well-known/jwks.json';
const REVOKED_INDEX = 5;
const CLEAR_INDEX = 9;
const OUT_OF_RANGE_INDEX = 9999;

// Build a StatusList2021 bitstring with REVOKED_INDEX set (MSB-first, per
// spec), gzip + base64url it, and sign the wrapping status-list JWT with an
// ES256 key published at `jku` (TWDIW signs status lists with a jku key, not
// the iss did:key).
const buildEncodedList = () => {
  const bytes = new Uint8Array(16);
  bytes[REVOKED_INDEX >> 3] |= 1 << (7 - (REVOKED_INDEX % 8));
  return Buffer.from(gzipSync(Buffer.from(bytes))).toString('base64url');
};

const buildStatusList = async ({
  privateKey, statusPurpose, issuer = ISSUER, jku = JKU,
  encodedList = buildEncodedList()
}) => {
  return new SignJWT({vc: {credentialSubject: {encodedList, statusPurpose}}})
    .setProtectedHeader({alg: 'ES256', kid: 'key-2', jku})
    .setIssuer(issuer)
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

describe('credential-status: twdiw-status-list-2021 module', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('readStatusBit', () => {
    it('throws on a non-integer index (NaN)', () => {
      const bytes = new Uint8Array(16);
      expect(() => readStatusBit({bytes, index: Number('x')}))
        .to.throwException(/invalid statusListIndex/);
    });

    it('throws on a negative index', () => {
      const bytes = new Uint8Array(16);
      expect(() => readStatusBit({bytes, index: -1}))
        .to.throwException(/invalid statusListIndex/);
    });

    it('throws on an out-of-range index', () => {
      const bytes = new Uint8Array(2);
      expect(() => readStatusBit({bytes, index: 999}))
        .to.throwException(/out of range/);
    });

    it('returns 1 for a set bit within range', () => {
      const bytes = new Uint8Array(16);
      bytes[REVOKED_INDEX >> 3] |= 1 << (7 - (REVOKED_INDEX % 8));
      expect(readStatusBit({bytes, index: REVOKED_INDEX})).to.be(1);
    });

    it('returns 0 for a clear bit within range', () => {
      const bytes = new Uint8Array(16);
      expect(readStatusBit({bytes, index: CLEAR_INDEX})).to.be(0);
    });
  });

  describe('decodeStatusList', () => {
    it('throws on non-gzip input', () => {
      const encodedList = Buffer.from('not gzip data').toString('base64url');
      expect(() => decodeStatusList({encodedList}))
        .to.throwException();
    });

    it('throws on empty/bad input', () => {
      expect(() => decodeStatusList({encodedList: undefined}))
        .to.throwException();
    });

    it('returns bytes for a valid gzipped bitstring', () => {
      const original = new Uint8Array([1, 2, 3, 4]);
      const encodedList = Buffer.from(gzipSync(Buffer.from(original)))
        .toString('base64url');
      const {bytes} = decodeStatusList({encodedList});
      expect(Buffer.compare(bytes, Buffer.from(original))).to.be(0);
    });

    it('throws when the inflated list exceeds the size cap', () => {
      // Buffer.alloc is zero-filled, so it compresses tiny but inflates past
      // the MAX_STATUS_LIST_BYTES ceiling (fast gzip-bomb guard check).
      const huge = Buffer.alloc(MAX_STATUS_LIST_BYTES + 1);
      const encodedList = Buffer.from(gzipSync(huge)).toString('base64url');
      expect(() => decodeStatusList({encodedList})).to.throwException();
    });
  });

  describe('checkTwdiwStatusList2021', () => {
    const stubEndpoints = async ({
      statusPurpose = 'revocation', issuer = ISSUER, jku = JKU,
      encodedList = buildEncodedList()
    } = {}) => {
      const {publicKey, privateKey} = await generateKeyPair('ES256');
      const publicJwk = {
        ...await exportJWK(publicKey), kid: 'key-2', alg: 'ES256'};
      const listJwt = await buildStatusList({
        privateKey, statusPurpose, issuer, jku, encodedList});
      const getStub = sinon.stub(httpClient, 'get');
      getStub.withArgs(STATUS_URL).resolves({data: {statusList: listJwt}});
      getStub.withArgs(jku).resolves({data: {keys: [publicJwk]}});
      return {publicJwk};
    };

    it('reports a revoked credential as not verified', async () => {
      await stubEndpoints();
      const result = await checkTwdiwStatusList2021(
        {credential: credentialWithStatus(REVOKED_INDEX)});
      expect(result.verified).to.be(false);
      expect(result.errors[0]).to.contain('revoked');
    });

    it('reports a suspended credential as not verified', async () => {
      await stubEndpoints({statusPurpose: 'suspension'});
      const result = await checkTwdiwStatusList2021(
        {credential: credentialWithStatus(REVOKED_INDEX)});
      expect(result.verified).to.be(false);
      expect(result.errors[0]).to.contain('suspended');
    });

    it('verifies a credential whose index bit is clear', async () => {
      await stubEndpoints();
      const result = await checkTwdiwStatusList2021(
        {credential: credentialWithStatus(CLEAR_INDEX)});
      expect(result.verified).to.be(true);
    });

    it('fails closed on an out-of-range index', async () => {
      await stubEndpoints();
      const result = await checkTwdiwStatusList2021(
        {credential: credentialWithStatus(OUT_OF_RANGE_INDEX)});
      expect(result.verified).to.be(false);
      expect(result.errors[0]).to.contain('out of range');
    });

    it('fails when the credential has no issuer (issuer binding)', async () => {
      await stubEndpoints();
      const credential = credentialWithStatus(REVOKED_INDEX);
      delete credential.issuer;
      const result = await checkTwdiwStatusList2021({credential});
      expect(result.verified).to.be(false);
      expect(result.errors[0]).to.contain('issuer');
    });

    it('fails when the jku is not same-origin as the list URL', async () => {
      await stubEndpoints({jku: 'https://evil.example/jwks'});
      const result = await checkTwdiwStatusList2021(
        {credential: credentialWithStatus(REVOKED_INDEX)});
      expect(result.verified).to.be(false);
      expect(result.errors[0]).to.contain('same-origin');
    });

    it('fails when the iss does not match the credential issuer', async () => {
      await stubEndpoints({issuer: 'did:key:zSomeOtherIssuer'});
      const result = await checkTwdiwStatusList2021(
        {credential: credentialWithStatus(REVOKED_INDEX)});
      expect(result.verified).to.be(false);
      expect(result.errors[0]).to.contain('issuer');
    });

    it('fails when no JWKS key matches the kid (no keys[0] fallback)',
      async () => {
        const {publicKey, privateKey} = await generateKeyPair('ES256');
        const publicJwk = {
          ...await exportJWK(publicKey), kid: 'different-kid', alg: 'ES256'};
        const listJwt = await buildStatusList({privateKey});
        const getStub = sinon.stub(httpClient, 'get');
        getStub.withArgs(STATUS_URL).resolves({data: {statusList: listJwt}});
        getStub.withArgs(JKU).resolves({data: {keys: [publicJwk]}});
        const result = await checkTwdiwStatusList2021(
          {credential: credentialWithStatus(REVOKED_INDEX)});
        expect(result.verified).to.be(false);
        expect(result.errors[0]).to.contain('kid');
      });

    it('fails when the list purpose does not match the entry purpose',
      async () => {
        await stubEndpoints({statusPurpose: 'revocation'});
        const result = await checkTwdiwStatusList2021(
          {credential: credentialWithStatus(CLEAR_INDEX, 'suspension')});
        expect(result.verified).to.be(false);
        expect(result.errors[0]).to.contain('does not match');
      });
  });

  describe('checkStatus router', () => {
    it('verifies when credentialStatus is absent', async () => {
      const result = await checkStatus({credential: {issuer: ISSUER}});
      expect(result.verified).to.be(true);
    });

    it('verifies when credentialStatus is an empty array', async () => {
      const result = await checkStatus(
        {credential: {issuer: ISSUER, credentialStatus: []}});
      expect(result.verified).to.be(true);
    });

    it('rejects an unsupported credentialStatus type', async () => {
      const credential = {
        issuer: ISSUER,
        credentialStatus: {type: 'MysteryStatusEntry', statusListIndex: 0}
      };
      const result = await checkStatus({credential});
      expect(result.verified).to.be(false);
      expect(result.errors[0]).to.contain('Unsupported status entry type(s)');
    });

    it('routes a BitstringStatusListEntry to the Bitstring handler',
      async () => {
        // The Bitstring handler is reached without a documentLoader, so it
        // fails Bitstring-specifically (returns `error`, not the `errors`
        // array shape the StatusList2021 handler returns).
        const credential = {
          issuer: ISSUER,
          credentialStatus: {
            type: 'BitstringStatusListEntry',
            statusPurpose: 'revocation',
            statusListCredential: STATUS_URL,
            statusListIndex: '0'
          }
        };
        const result = await checkStatus({credential});
        expect(result.verified).to.be(false);
        expect(result.error).to.be.an(Error);
        expect(result.error.message).to.contain('documentLoader');
        expect(result.errors).to.be(undefined);
      });
  });

  describe('checkStatus router: twdiwStatusList2021Enabled gate', () => {
    const stubTwdiwEndpoints = async () => {
      const {publicKey, privateKey} = await generateKeyPair('ES256');
      const publicJwk = {
        ...await exportJWK(publicKey), kid: 'key-2', alg: 'ES256'};
      const listJwt = await buildStatusList({privateKey});
      const getStub = sinon.stub(httpClient, 'get');
      getStub.withArgs(STATUS_URL).resolves({data: {statusList: listJwt}});
      getStub.withArgs(JKU).resolves({data: {keys: [publicJwk]}});
      return getStub;
    };

    it('rejects StatusList2021Entry as unsupported when the flag is off',
      async () => {
        const getStub = sinon.stub(httpClient, 'get');
        const result = await checkStatus(
          {credential: credentialWithStatus(REVOKED_INDEX)});
        expect(result.verified).to.be(false);
        expect(result.errors[0]).to.contain('Unsupported status entry');
        expect(result.errors[0]).to.contain('StatusList2021Entry');
        // fail-closed: the TWDIW handler is never entered, so no fetch occurs
        expect(getStub.called).to.be(false);
      });

    it('routes StatusList2021Entry to the TWDIW handler when enabled (revoked)',
      async () => {
        await stubTwdiwEndpoints();
        const result = await checkStatus({
          credential: credentialWithStatus(REVOKED_INDEX),
          twdiwStatusList2021Enabled: true
        });
        expect(result.verified).to.be(false);
        expect(result.errors[0]).to.contain('revoked');
      });

    it('routes to the TWDIW handler when enabled (clear bit verifies)',
      async () => {
        await stubTwdiwEndpoints();
        const result = await checkStatus({
          credential: credentialWithStatus(CLEAR_INDEX),
          twdiwStatusList2021Enabled: true
        });
        expect(result.verified).to.be(true);
      });
  });

  // sanity: gunzipSync round-trips what decodeStatusList consumes
  it('decodeStatusList output matches a manual gunzip', () => {
    const original = new Uint8Array([9, 8, 7]);
    const gz = gzipSync(Buffer.from(original));
    const encodedList = Buffer.from(gz).toString('base64url');
    const {bytes} = decodeStatusList({encodedList});
    expect(Buffer.compare(bytes, gunzipSync(gz))).to.be(0);
  });
});
