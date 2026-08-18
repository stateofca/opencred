/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {
  appleWalletTestEntry,
  googleWalletTestEntry
} from '../fixtures/wallet-certificates.js';
import {baseUrl} from '../mock-data.js';
import {config} from '@bedrock/core';
import {createExchangeWithAuthRequest} from '../utils/exchanges.js';
import {database} from '../../lib/database.js';
import {exampleKey2} from '../fixtures/signingKeys.js';
import expect from 'expect.js';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

const mdocTestRP = {
  type: 'native',
  clientId: 'multi-profile-test',
  query: [{
    format: ['mso_mdoc'],
    fields: {
      'org.iso.18013.5.1': ['given_name', 'family_name']
    }
  }],
  clientSecret: 'shhh',
  oidc: {
    redirectUri: 'https://example.com'
  }
};

describe('multi-profile DC API authorization request', function() {
  let rpStub;
  let baseUriStub;
  let signingKeysStub;
  let certStub;

  beforeEach(function() {
    rpStub = sinon.stub(config.opencred, 'workflows').value([mdocTestRP]);
    baseUriStub = sinon.stub(config.server, 'baseUri')
      .value('https://example.com');
    signingKeysStub = sinon.stub(config.opencred, 'signingKeys')
      .value([{...exampleKey2, purpose: ['authorization_request']}]);
    certStub = sinon.stub(config.opencred, 'walletCertificates')
      .value([googleWalletTestEntry, appleWalletTestEntry]);
  });

  afterEach(function() {
    rpStub.restore();
    baseUriStub.restore();
    signingKeysStub.restore();
    certStub.restore();
  });

  async function requestProfiles(profiles, {certificates, seedVariables} = {}) {
    if(certificates) {
      certStub.restore();
      certStub = sinon.stub(config.opencred, 'walletCertificates')
        .value(certificates);
    }
    const exchange = await createExchangeWithAuthRequest({
      workflow: mdocTestRP});
    if(seedVariables) {
      exchange.variables = {...exchange.variables, ...seedVariables};
    }
    const findOneStub = sinon.stub(
      database.collections.Exchanges, 'findOne'
    ).resolves({...exchange, workflowId: mdocTestRP.clientId});
    const replaceOneStub = sinon.stub(
      database.collections.Exchanges, 'replaceOne'
    ).resolves();

    const searchParams = new URLSearchParams();
    for(const profile of profiles) {
      searchParams.append('profile', profile);
    }

    let result;
    let err;
    try {
      result = await client.post(
        `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
        `${exchange.id}/openid/client/authorization/request`,
        {
          body: searchParams,
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json'
          }
        });
    } catch(e) {
      err = e;
    }

    findOneStub.restore();
    replaceOneStub.restore();
    return {result, err, replaceOneStub, exchange};
  }

  describe('apple-wallet + google-wallet', function() {
    it('returns one envelope per profile in requested order', async function() {
      const {result, err} = await requestProfiles(
        ['apple-wallet', 'google-wallet']);

      expect(err).to.be(undefined);
      expect(result.status).to.equal(200);

      const {dcApiRequests} = result.data;
      expect(dcApiRequests).to.be.an('array');
      expect(dcApiRequests.length).to.equal(2);

      expect(dcApiRequests[0].profile).to.equal('apple-wallet');
      expect(dcApiRequests[0].dcApiRequest.protocol)
        .to.equal('org-iso-mdoc');
      expect(dcApiRequests[0].dcApiRequest.data.deviceRequest)
        .to.be.a('string');
      expect(dcApiRequests[0].dcApiRequest.data.encryptionInfo)
        .to.be.a('string');

      expect(dcApiRequests[1].profile).to.equal('google-wallet');
      expect(dcApiRequests[1].dcApiRequest.protocol)
        .to.equal('openid4vp-v1-signed');
      expect(dcApiRequests[1].dcApiRequest.data.request).to.be.a('string');
    });

    it('honors the requested order when reversed', async function() {
      const {result} = await requestProfiles(
        ['google-wallet', 'apple-wallet']);
      const {dcApiRequests} = result.data;
      expect(dcApiRequests.map(r => r.profile))
        .to.eql(['google-wallet', 'apple-wallet']);
    });

    it('omits the singular dcApiRequest for a multi-profile request',
      async function() {
        const {result} = await requestProfiles(
          ['apple-wallet', 'google-wallet']);
        expect(result.data.dcApiRequest).to.be(undefined);
      });

    it('persists one pending request per profile in a single write',
      async function() {
        const {replaceOneStub} = await requestProfiles(
          ['apple-wallet', 'google-wallet']);

        expect(replaceOneStub.calledOnce).to.be(true);
        const saved = replaceOneStub.firstCall.args[1];
        expect(saved.state).to.equal('active');

        const pending = saved.variables.dcApiRequests;
        expect(pending).to.be.an('array');
        expect(pending.length).to.equal(2);
        expect(pending.map(p => p.profile))
          .to.eql(['apple-wallet', 'google-wallet']);
        expect(pending.map(p => p.protocol))
          .to.eql(['org-iso-mdoc', 'openid4vp-v1-signed']);

        // Every entry shares the group id that correlates this one call.
        const [groupId] = pending.map(p => p.requestGroupId);
        expect(groupId).to.be.a('string');
        expect(pending.every(p => p.requestGroupId === groupId)).to.be(true);

        // Each profile's own key material is namespaced under its entry, so
        // neither request can clobber the other.
        expect(pending[0].material.hpkeRecipientPrivateKey).to.be.an('object');
        expect(pending[0].material.base64EncryptionInfo).to.be.a('string');
        expect(pending[1].material.ephemeralKeyAgreementPrivateKey)
          .to.be.an('object');

        // Each entry must also carry its authorization request. Annex C
        // (apple-wallet) writes it only into its exchange variables, never at
        // the top level of its result, so a persisted apple-wallet entry
        // without it is exactly the dropped-request bug: its response would
        // fail "Authorization request not found in exchange variables".
        expect(pending[0].authorizationRequest).to.be.an('object');
        expect(pending[0].authorizationRequest.expected_origins)
          .to.be.an('array');
        expect(pending[0].authorizationRequest.nonce).to.be.a('string');
        expect(pending[1].authorizationRequest).to.be.an('object');
        expect(pending[1].authorizationRequest.nonce).to.be.a('string');
      });
  });

  describe('single profile back-compat', function() {
    it('returns both the singular envelope and the array', async function() {
      const {result} = await requestProfiles(['google-wallet']);
      expect(result.status).to.equal(200);
      expect(result.data.dcApiRequest).to.be.an('object');
      expect(result.data.dcApiRequest.protocol)
        .to.equal('openid4vp-v1-signed');
      expect(result.data.dcApiRequests.length).to.equal(1);
      expect(result.data.dcApiRequests[0].dcApiRequest)
        .to.eql(result.data.dcApiRequest);
    });

    // A single apple-wallet request takes the same persistence branch as a
    // multi-profile one, so it was equally broken: the entry was persisted
    // without its authorization request.
    it('persists the authorization request for a single apple-wallet request',
      async function() {
        const {replaceOneStub} = await requestProfiles(['apple-wallet']);

        expect(replaceOneStub.calledOnce).to.be(true);
        const saved = replaceOneStub.firstCall.args[1];
        const pending = saved.variables.dcApiRequests;
        expect(pending.length).to.equal(1);
        expect(pending[0].profile).to.equal('apple-wallet');
        expect(pending[0].authorizationRequest).to.be.an('object');
        expect(pending[0].authorizationRequest.expected_origins)
          .to.be.an('array');
      });
  });

  // A DC API attempt was made on this exchange and abandoned, leaving its
  // pending-request array behind. The wallet then falls back to the draft-18
  // flow on the SAME exchange. Serving that non-DC-API request must supersede
  // the abandoned DC API offer: the persisted exchange has to be left in the
  // flat shape a non-DC-API exchange has always had, or a later `direct_post`
  // response would be misrouted to a DC API handler against dead key material.
  describe('non-DC-API request supersedes an abandoned DC API offer',
    function() {
      it('drops the stale pending-request array when persisting a draft-18 ' +
        'request', async function() {
        const {result, err, replaceOneStub} = await requestProfiles(
          ['OID4VP-draft18'],
          {
            seedVariables: {
              dcApiRequests: [{
                profile: 'apple-wallet',
                protocol: 'org-iso-mdoc',
                requestGroupId: 'stale-group',
                authorizationRequest: {nonce: 'stale-nonce'},
                material: {
                  hpkeRecipientPrivateKey: {
                    kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd'
                  }
                }
              }]
            }
          });

        expect(err).to.be(undefined);
        expect(result.status).to.equal(200);

        // The draft-18 request persists through the JAR-JWT path, and it must
        // leave no `dcApiRequests` behind: the flat shape is exactly what a
        // draft-18 response resolves against.
        expect(replaceOneStub.calledOnce).to.be(true);
        const saved = replaceOneStub.firstCall.args[1];
        expect(saved.variables.dcApiRequests).to.be(undefined);
        // The flat draft-18 request state is what remains.
        expect(saved.variables.profile).to.equal('OID4VP-draft18');
        expect(saved.variables.authorizationRequest).to.be.an('object');
      });
    });

  describe('validation', function() {
    it('rejects a multi-profile request containing a non-DC-API profile',
      async function() {
        const {err} = await requestProfiles(
          ['apple-wallet', '18013-7-Annex-B']);
        expect(err).to.not.be(undefined);
        expect(err.status).to.equal(400);
        expect(err.data.error).to.equal('PROFILE_NOT_DC_API');
        expect(err.data.message).to.contain('18013-7-Annex-B');
      });

    // Two requested names can resolve to the same profile, and putting the
    // identical envelope on the wire twice is what the collision ban exists to
    // prevent.
    it('deduplicates repeated profiles', async function() {
      const {result} = await requestProfiles(
        ['google-wallet', 'google-wallet']);
      expect(result.status).to.equal(200);
      expect(result.data.dcApiRequests.length).to.equal(1);
      // Deduplicated to one, so the single-profile envelope is present too.
      expect(result.data.dcApiRequest).to.be.an('object');
    });

    // Strict all-or-nothing: dropping a profile that failed to build would turn
    // a misconfiguration into a wallet that silently never appears.
    it('fails the whole call and persists nothing when one profile cannot ' +
      'be served', async function() {
      const {err, replaceOneStub} = await requestProfiles(
        ['apple-wallet', 'google-wallet'],
        // Apple can be served, Google cannot: no google-wallet certificate.
        {certificates: [appleWalletTestEntry]});

      expect(err).to.not.be(undefined);
      expect(err.status).to.equal(400);
      expect(err.data.message).to.contain('google-wallet');
      expect(err.data.profiles).to.be.an('array');
      expect(err.data.profiles.length).to.equal(1);
      expect(err.data.profiles[0].profile).to.equal('google-wallet');
      expect(replaceOneStub.called).to.be(false);
    });
  });
});
