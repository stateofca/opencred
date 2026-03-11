/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';
import {domainToDidWeb} from '../../lib/didWeb.js';
import expect from 'expect.js';
import {
  generateAuthorizationRequest
} from '../../lib/workflows/profiles/native-oid4vp-standard.js';

// Test workflow with mixed formats (jwt_vc_json and mso_mdoc)
const testWorkflow = {
  type: 'native',
  clientId: 'test-oid4vp-1.0',
  query: [
    {
      type: ['Iso18013DriversLicenseCredential'],
      context: [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/vdl/v1',
        'https://w3id.org/vdl/aamva/v1'
      ],
      format: ['jwt_vc_json']
    },
    {
      format: ['mso_mdoc'],
      fields: {
        'org.iso.18013.5.1': [
          'family_name',
          'given_name',
          'document_number'
        ]
      }
    }
  ],
  clientSecret: 'shhh',
  oidc: {
    redirectUri: 'https://example.com'
  }
};

describe('OID4VP 1.0 Client ID Format', function() {
  describe('generateAuthorizationRequest', function() {
    const mockExchange = {
      id: 'test-exchange',
      challenge: 'test-challenge-123',
      state: 'pending',
      variables: {}
    };

    const mockRequestUrl = '/workflows/test/exchanges/123/openid/' +
      'client/authorization/request';

    describe('client_id format', function() {
      it('should use OID4VP 1.0 decentralized_identifier prefix',
        async function() {
          const result = await generateAuthorizationRequest({
            workflow: testWorkflow,
            exchange: mockExchange,
            requestUrl: mockRequestUrl,
            profile: 'OID4VP-1.0',
            responseMode: 'dc_api'
          });

          expect(result).to.have.property('authorizationRequest');
          expect(result).to.have.property('updatedExchange');
          expect(result.authorizationRequest.client_id_scheme).to.be(undefined);
          expect(result.authorizationRequest.client_id).to.equal(
            `decentralized_identifier:${domainToDidWeb(config.server.baseUri)}`
          );
          expect(result.signingMetadata).to.be(undefined);
        });

      it('should use OID4VP 1.0 format when clientIdScheme is not provided',
        async function() {
          const result = await generateAuthorizationRequest({
            workflow: testWorkflow,
            exchange: mockExchange,
            requestUrl: mockRequestUrl,
            profile: 'OID4VP-1.0',
            responseMode: 'dc_api'
            // clientIdScheme not provided - OID4VP 1.0 omits client_id_scheme
          });

          expect(result.authorizationRequest.client_id_scheme).to.be(undefined);
          expect(result.authorizationRequest.client_id).to.equal(
            `decentralized_identifier:${domainToDidWeb(config.server.baseUri)}`
          );
        });

      it('should use OID4VP 1.0 format when clientIdScheme is explicitly "did"',
        async function() {
          const result = await generateAuthorizationRequest({
            workflow: testWorkflow,
            exchange: mockExchange,
            requestUrl: mockRequestUrl,
            profile: 'OID4VP-1.0',
            responseMode: 'dc_api',
            clientIdScheme: 'did'
          });

          expect(result.authorizationRequest.client_id_scheme).to.be(undefined);
          expect(result.authorizationRequest.client_id).to.equal(
            `decentralized_identifier:${domainToDidWeb(config.server.baseUri)}`
          );
          expect(result.signingMetadata).to.be(undefined);
        });
    });

    describe('expected_origins', function() {
      it('should include expected_origins when responseMode is dc_api',
        async function() {
          const testBaseUri = 'https://test.example.com';
          const result = await generateAuthorizationRequest({
            workflow: testWorkflow,
            exchange: mockExchange,
            requestUrl: mockRequestUrl,
            profile: 'OID4VP-1.0',
            responseMode: 'dc_api',
            baseUri: testBaseUri
          });

          expect(result.authorizationRequest.expected_origins).to.be.an(
            'array');
          expect(result.authorizationRequest.expected_origins.length
          ).to.equal(1);
          expect(result.authorizationRequest.expected_origins[0])
            .to.equal(testBaseUri);
        });

      it('should include expected_origins when responseMode is dc_api.jwt',
        async function() {
          const testBaseUri = 'https://test.example.com';
          const result = await generateAuthorizationRequest({
            workflow: testWorkflow,
            exchange: mockExchange,
            requestUrl: mockRequestUrl,
            profile: 'OID4VP-1.0',
            responseMode: 'dc_api.jwt',
            baseUri: testBaseUri
          });

          expect(result.authorizationRequest.expected_origins).to.be.an(
            'array');
          expect(result.authorizationRequest.expected_origins.length
          ).to.equal(1);
          expect(result.authorizationRequest.expected_origins[0])
            .to.equal(testBaseUri);
        });

      it('should NOT include expected_origins when responseMode is direct_post',
        async function() {
          const result = await generateAuthorizationRequest({
            workflow: testWorkflow,
            exchange: mockExchange,
            requestUrl: mockRequestUrl,
            profile: 'OID4VP-1.0',
            responseMode: 'direct_post'
          });

          expect(result.authorizationRequest.expected_origins)
            .to.be(undefined);
        });

      it('should include expected_origins with correct server base URI',
        async function() {
          const testBaseUri = 'https://example.org';
          const result = await generateAuthorizationRequest({
            workflow: testWorkflow,
            exchange: mockExchange,
            requestUrl: mockRequestUrl,
            profile: 'OID4VP-1.0',
            responseMode: 'dc_api',
            baseUri: testBaseUri
          });

          expect(result.authorizationRequest.expected_origins)
            .to.eql([testBaseUri]);
        });
    });
  });
});
