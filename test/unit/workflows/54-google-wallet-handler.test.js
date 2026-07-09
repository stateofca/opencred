/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {decodeJwt, decodeProtectedHeader} from 'jose';

import {config} from '@bedrock/core';
import {
  generateAuthorizationRequest
} from '../../../lib/workflows/profiles/native-google-wallet.js';
import {
  googleWalletTestEntry
} from '../../fixtures/wallet-certificates.js';

import expect from 'expect.js';

const testWorkflow = {
  type: 'native',
  clientId: 'gw-test',
  query: [{
    format: ['mso_mdoc'],
    fields: {
      'org.iso.18013.5.1': ['given_name', 'family_name']
    }
  }]
};

describe('native-google-wallet generateAuthorizationRequest', () => {
  let prevOpencred;
  let prevServer;

  beforeEach(() => {
    prevOpencred = config.opencred;
    prevServer = config.server;
    config.opencred = {
      ...prevOpencred,
      walletCertificates: [googleWalletTestEntry]
    };
    config.server = {
      ...prevServer,
      baseUri: 'https://example.com'
    };
  });

  afterEach(() => {
    config.opencred = prevOpencred;
    config.server = prevServer;
  });

  it('returns a signed DC API envelope with x509_hash client_id',
    async () => {
      const result = await generateAuthorizationRequest({
        workflow: testWorkflow,
        exchange: {id: 'ex-1', variables: {}},
        profile: 'google-wallet',
        responseMode: 'dc_api.jwt'
      });

      // Verify DC API envelope
      expect(result.dcApiRequest).to.be.an('object');
      expect(result.dcApiRequest.protocol).to.equal(
        'openid4vp-v1-signed');
      expect(result.dcApiRequest.data.request).to.be.a('string');

      // Verify authorization request
      const {authorizationRequest} = result;
      expect(authorizationRequest.client_id).to.match(
        /^x509_hash:/);
      // OID4VP 1.0 omits client_id_scheme (scheme is the client_id prefix).
      expect(authorizationRequest.client_id_scheme).to.be(undefined);
      expect(authorizationRequest.response_mode).to.equal(
        'dc_api.jwt');
      expect(authorizationRequest.response_type).to.equal(
        'vp_token');
      expect(authorizationRequest.expected_origins).to.eql(
        ['https://example.com']);
      expect(authorizationRequest.dcql_query).to.be.an('object');
      expect(authorizationRequest.client_metadata).to.be.an('object');
      expect(authorizationRequest.client_metadata.jwks).to.be.an(
        'object');
      expect(authorizationRequest.client_metadata.jwks.keys).to.be.an(
        'array');
      expect(
        authorizationRequest.client_metadata.vp_formats_supported
      ).to.be.an('object');

      // Verify JWT header
      const jwt = result.dcApiRequest.data.request;
      const header = decodeProtectedHeader(jwt);
      expect(header.alg).to.equal('ES256');
      expect(header.typ).to.equal('oauth-authz-req+jwt');
      expect(header.x5c).to.be.an('array');
      expect(header.x5c.length).to.be.greaterThan(0);

      // Verify JWT payload matches authorizationRequest
      const payload = decodeJwt(jwt);
      expect(payload.client_id).to.equal(
        authorizationRequest.client_id);
      expect(payload.response_mode).to.equal('dc_api.jwt');

      // Verify exchange was updated
      expect(result.updatedExchange.state).to.equal('active');
      expect(
        result.updatedExchange.variables.authorizationRequest
      ).to.be.ok();
      expect(
        result.updatedExchange.variables
          .ephemeralKeyAgreementPrivateKey
      ).to.be.ok();
      expect(
        result.updatedExchange.variables
          .ephemeralKeyAgreementPublicKey
      ).to.be.ok();
      expect(
        result.updatedExchange.variables.encodedSessionTranscript
      ).to.be.ok();
    });

  it('emits client_metadata.gw_rp_metadata_bytes when configured',
    async () => {
      config.opencred = {
        ...config.opencred,
        walletCertificates: [{
          ...googleWalletTestEntry,
          google: {rpMetadataBytes: 'AbC-_123'}
        }]
      };

      const result = await generateAuthorizationRequest({
        workflow: testWorkflow,
        exchange: {id: 'ex-1', variables: {}},
        profile: 'google-wallet',
        responseMode: 'dc_api.jwt'
      });

      expect(
        result.authorizationRequest.client_metadata.gw_rp_metadata_bytes
      ).to.equal('AbC-_123');
    });

  it('omits gw_rp_metadata_bytes when not configured', async () => {
    const result = await generateAuthorizationRequest({
      workflow: testWorkflow,
      exchange: {id: 'ex-1', variables: {}},
      profile: 'google-wallet',
      responseMode: 'dc_api.jwt'
    });

    expect(result.authorizationRequest.client_metadata).to.not.have.key(
      'gw_rp_metadata_bytes');
  });

  it('throws ReaderAuthConfigError when no google-wallet certs',
    async () => {
      config.opencred = {...config.opencred, walletCertificates: []};

      let caught;
      try {
        await generateAuthorizationRequest({
          workflow: testWorkflow,
          exchange: {id: 'ex-1', variables: {}},
          profile: 'google-wallet',
          responseMode: 'dc_api.jwt'
        });
      } catch(err) {
        caught = err;
      }
      expect(caught).to.be.ok();
      expect(caught.name).to.equal('ReaderAuthConfigError');
      expect(caught.statusCode).to.equal(400);
    });
});
