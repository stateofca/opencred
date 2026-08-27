/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {decodeJwt, decodeProtectedHeader} from 'jose';
import {baseUrl} from '../mock-data.js';
import {config} from '@bedrock/core';
import {createExchangeWithAuthRequest} from '../utils/exchanges.js';
import {database} from '../../lib/database.js';
import {exampleKey2} from '../fixtures/signingKeys.js';
import expect from 'expect.js';
import {
  googleWalletTestEntry
} from '../fixtures/wallet-certificates.js';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

const mdocTestRP = {
  type: 'native',
  clientId: 'mdoc-test',
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

describe('profile=google-wallet end-to-end', function() {
  let rpStub;
  let baseUriStub;
  let signingKeysStub;

  beforeEach(function() {
    rpStub = sinon.stub(config.opencred, 'workflows').value(
      [mdocTestRP]);
    baseUriStub = sinon.stub(config.server, 'baseUri').value(
      'https://example.com'
    );
    signingKeysStub = sinon.stub(
      config.opencred, 'signingKeys'
    ).value(
      [{...exampleKey2, purpose: ['authorization_request']}]
    );
  });

  afterEach(function() {
    rpStub.restore();
    baseUriStub.restore();
    signingKeysStub.restore();
  });

  describe('with configured walletCertificates', function() {
    let walletCertStub;

    beforeEach(function() {
      walletCertStub = sinon.stub(
        config.opencred, 'walletCertificates'
      ).value([googleWalletTestEntry]);
    });

    afterEach(function() {
      walletCertStub.restore();
    });

    it('returns 200 with a signed OID4VP envelope', async function() {
      const exchange = await createExchangeWithAuthRequest({
        workflow: mdocTestRP});
      const findOneStub = sinon.stub(
        database.collections.Exchanges, 'findOne'
      ).resolves({...exchange, workflowId: mdocTestRP.clientId});
      const replaceOneStub = sinon.stub(
        database.collections.Exchanges, 'replaceOne'
      ).resolves();

      const searchParams = new URLSearchParams();
      searchParams.set('profile', 'google-wallet');

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

      expect(err).to.be(undefined);
      expect(result.status).to.equal(200);
      expect(result.data.dcApiRequest).to.be.an('object');

      const {dcApiRequest} = result.data;

      // Verify protocol
      expect(dcApiRequest.protocol).to.equal('openid4vp-v1-signed');

      // Verify data contains signed JWT
      expect(dcApiRequest.data).to.be.an('object');
      expect(dcApiRequest.data.request).to.be.a('string');
      const jwt = dcApiRequest.data.request;

      // Verify JWT header
      const header = decodeProtectedHeader(jwt);
      expect(header.alg).to.equal('ES256');
      expect(header.typ).to.equal('oauth-authz-req+jwt');
      expect(header.x5c).to.be.an('array');
      expect(header.x5c.length).to.be.greaterThan(0);

      // Verify JWT payload
      const payload = decodeJwt(jwt);
      expect(payload.client_id).to.match(/^x509_hash:/);
      // OID4VP 1.0 omits client_id_scheme (scheme is the client_id prefix).
      expect(payload.client_id_scheme).to.be(undefined);
      expect(payload.response_mode).to.equal('dc_api.jwt');
      expect(payload.response_type).to.equal('vp_token');
      expect(payload.expected_origins).to.eql(
        ['https://example.com']);
      expect(payload.nonce).to.be.a('string');
      expect(payload.state).to.be.a('string');

      // Verify dcql_query
      expect(payload.dcql_query).to.be.an('object');
      expect(payload.dcql_query.credentials).to.be.an('array');
      expect(payload.dcql_query.credentials.length).to.be
        .greaterThan(0);

      // Verify client_metadata
      expect(payload.client_metadata).to.be.an('object');
      expect(payload.client_metadata.jwks).to.be.an('object');
      expect(payload.client_metadata.jwks.keys).to.be.an('array');
      expect(payload.client_metadata.jwks.keys.length).to.be
        .greaterThan(0);
      const encKey = payload.client_metadata.jwks.keys[0];
      expect(encKey.kty).to.equal('EC');
      expect(encKey.crv).to.equal('P-256');
      expect(encKey.use).to.equal('enc');
      expect(encKey.alg).to.equal('ECDH-ES');
      expect(encKey.kid).to.be.a('string');

      expect(
        payload.client_metadata.vp_formats_supported
      ).to.be.an('object');
      expect(
        payload.client_metadata.vp_formats_supported.mso_mdoc
      ).to.be.an('object');

      // Verify x509_hash is deterministic from fixture cert
      const {
        parseCertificateChainPem,
        computeX509HashClientId
      } = await import(
        '../../lib/workflows/common/wallet-certificates.js'
      );
      const ders = parseCertificateChainPem(
        googleWalletTestEntry.certificatePem);
      const expectedClientId = computeX509HashClientId(ders[0]);
      expect(payload.client_id).to.equal(expectedClientId);

      // Verify exchange was persisted with correct variables. Request state
      // lives in `variables.dcApiRequests` rather than a flat slot, so that one
      // exchange can hold a pending request per profile when a button requests
      // several at once; the per-profile key material is unchanged, just
      // namespaced under its own entry.
      expect(replaceOneStub.calledOnce).to.be(true);
      const savedExchange = replaceOneStub.firstCall.args[1];
      expect(savedExchange.state).to.equal('active');
      expect(savedExchange.variables.dcApiRequests).to.be.an('array');
      expect(savedExchange.variables.dcApiRequests.length).to.equal(1);
      const [pending] = savedExchange.variables.dcApiRequests;
      expect(pending.profile).to.equal('google-wallet');
      expect(pending.protocol).to.equal('openid4vp-v1-signed');
      expect(pending.requestGroupId).to.be.a('string');
      expect(pending.authorizationRequest).to.be.an('object');
      expect(
        pending.material.ephemeralKeyAgreementPrivateKey
      ).to.be.an('object');
      expect(
        pending.material.ephemeralKeyAgreementPublicKey
      ).to.be.an('object');
      expect(pending.material.encodedSessionTranscript).to.be.ok();
      // The ephemeral encryption key's per-request `kid` is lifted onto the
      // entry so response routing can cross-check a JWE header without
      // knowing which profile stores its key under which name.
      expect(pending.kid).to.equal(
        pending.material.ephemeralKeyAgreementPrivateKey.kid);
      // This request's authorization request went only into its own entry: the
      // flat slot is deliberately no longer written, so it still holds whatever
      // the fixture seeded (a `did` / direct_post request) rather than this
      // google-wallet one.
      expect(
        savedExchange.variables.authorizationRequest?.client_id_scheme
      ).to.not.equal('x509_hash');
      expect(savedExchange.variables.authorizationRequest)
        .to.not.eql(pending.authorizationRequest);
    });
  });

  describe('without configured walletCertificates', function() {
    let walletCertStub;

    beforeEach(function() {
      walletCertStub = sinon.stub(
        config.opencred, 'walletCertificates'
      ).value([]);
    });

    afterEach(function() {
      walletCertStub.restore();
    });

    it('returns 400 READER_AUTH_CONFIG for google-wallet',
      async function() {
        const exchange = await createExchangeWithAuthRequest({
          workflow: mdocTestRP});
        const findOneStub = sinon.stub(
          database.collections.Exchanges, 'findOne'
        ).resolves({
          ...exchange,
          workflowId: mdocTestRP.clientId
        });

        const searchParams = new URLSearchParams();
        searchParams.set('profile', 'google-wallet');

        let err;
        try {
          await client.post(
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

        expect(err).to.not.be(undefined);
        expect(err.status).to.equal(400);
        expect(err.data.error).to.equal('READER_AUTH_CONFIG');
      });
  });
});
