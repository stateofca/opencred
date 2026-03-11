/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  convertDerCertificateToPem,
  generateCertificateChain
} from '../utils/x509.js';
import {config} from '@bedrock/core';
import {exampleKey2} from '../fixtures/signingKeys.js';
import expect from 'expect.js';
import {
  generateAuthorizationRequest
} from '../../lib/workflows/profiles/native-oid4vp-standard.js';

// Test workflow with mixed formats (jwt_vc_json and mso_mdoc)
const testWorkflow = {
  type: 'native',
  clientId: 'test-oid4vp-x509',
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

describe('OID4VP x509_san_dns Client ID Scheme', function() {
  let originalSigningKeys;
  let signingKeyWithCert;

  before(async function() {
    // Store original signing keys
    originalSigningKeys = config.opencred.signingKeys;

    // Generate certificate chain for testing
    const {chain} = await generateCertificateChain({length: 2});
    // chain[0] is the leaf certificate, chain[1] is the issuer
    // Convert the leaf certificate (first in chain) to PEM
    const certPem = convertDerCertificateToPem(chain[0].raw);

    // Create signing key with certificate for x509_san_dns tests
    signingKeyWithCert = {
      ...exampleKey2,
      purpose: ['authorization_request'],
      certificatePem: certPem
    };

    // Set up signing keys in config
    config.opencred.signingKeys = [signingKeyWithCert];
  });

  after(function() {
    // Restore original signing keys
    config.opencred.signingKeys = originalSigningKeys;
  });

  describe('generateAuthorizationRequest', function() {
    const mockExchange = {
      id: 'test-exchange',
      challenge: 'test-challenge-123',
      state: 'pending',
      variables: {}
    };

    const mockRequestUrl = '/workflows/test/exchanges/123/openid/' +
      'client/authorization/request';

    it('should use x509_san_dns client_id_scheme when specified',
      async function() {
        const result = await generateAuthorizationRequest({
          workflow: testWorkflow,
          exchange: mockExchange,
          requestUrl: mockRequestUrl,
          profile: 'OID4VP-1.0',
          responseMode: 'dc_api',
          clientIdScheme: 'x509_san_dns'
        });

        expect(result.authorizationRequest.client_id_scheme)
          .to.equal('x509_san_dns');
        expect(result.authorizationRequest.client_id).to.match(
          /^x509_san_dns:/
        );
        expect(result).to.have.property('signingMetadata');
      });

    it('should extract hostname correctly for x509_san_dns client_id',
      async function() {
        const testBaseUri = 'https://example.com';
        const result = await generateAuthorizationRequest({
          workflow: testWorkflow,
          exchange: mockExchange,
          requestUrl: mockRequestUrl,
          profile: 'OID4VP-1.0',
          responseMode: 'dc_api',
          clientIdScheme: 'x509_san_dns',
          baseUri: testBaseUri
        });

        expect(result.authorizationRequest.client_id)
          .to.equal('x509_san_dns:example.com');
      });

    it('should extract hostname from different baseUri formats',
      async function() {
        const testCases = [
          {baseUri: 'https://test.example.com', expected: 'test.example.com'},
          {baseUri: 'https://subdomain.example.org:8080',
            expected: 'subdomain.example.org'},
          {baseUri: 'http://localhost:3000', expected: 'localhost'}
        ];

        for(const testCase of testCases) {
          const result = await generateAuthorizationRequest({
            workflow: testWorkflow,
            exchange: mockExchange,
            requestUrl: mockRequestUrl,
            profile: 'OID4VP-1.0',
            responseMode: 'dc_api',
            clientIdScheme: 'x509_san_dns',
            baseUri: testCase.baseUri
          });

          expect(result.authorizationRequest.client_id)
            .to.equal(`x509_san_dns:${testCase.expected}`);
        }
      });

    it('should return signingMetadata with kid, x5c, and alg for x509_san_dns',
      async function() {
        const result = await generateAuthorizationRequest({
          workflow: testWorkflow,
          exchange: mockExchange,
          requestUrl: mockRequestUrl,
          profile: 'OID4VP-1.0',
          responseMode: 'dc_api',
          clientIdScheme: 'x509_san_dns'
        });

        expect(result.signingMetadata).to.be.an('object');
        expect(result.signingMetadata).to.have.property('kid');
        expect(result.signingMetadata).to.have.property('x5c');
        expect(result.signingMetadata).to.have.property('alg');

        expect(result.signingMetadata.kid).to.be.a('string');
        expect(result.signingMetadata.kid).to.contain('#');
        expect(result.signingMetadata.x5c).to.be.an('array');
        expect(result.signingMetadata.alg).to.equal('ES256');
      });

    it('should format kid correctly for x509_san_dns',
      async function() {
        const testBaseUri = 'https://test.example.com';
        const result = await generateAuthorizationRequest({
          workflow: testWorkflow,
          exchange: mockExchange,
          requestUrl: mockRequestUrl,
          profile: 'OID4VP-1.0',
          responseMode: 'dc_api',
          clientIdScheme: 'x509_san_dns',
          baseUri: testBaseUri
        });

        expect(result.signingMetadata.kid)
          .to.equal(`test.example.com#${signingKeyWithCert.id}`);
      });

    it('should include x5c certificate chain in signingMetadata',
      async function() {
        const result = await generateAuthorizationRequest({
          workflow: testWorkflow,
          exchange: mockExchange,
          requestUrl: mockRequestUrl,
          profile: 'OID4VP-1.0',
          responseMode: 'dc_api',
          clientIdScheme: 'x509_san_dns'
        });

        expect(result.signingMetadata.x5c).to.be.an('array');
        expect(result.signingMetadata.x5c.length).to.be.greaterThan(0);
        // x5c should contain base64-encoded DER certificates
        result.signingMetadata.x5c.forEach(cert => {
          expect(cert).to.be.a('string');
          // Base64 strings should not contain whitespace
          expect(cert).to.not.match(/\s/);
        });
      });

    it('should throw error if no key with authorization_request purpose',
      async function() {
        // Temporarily set signing keys without authorization_request purpose
        const originalKeys = config.opencred.signingKeys;
        config.opencred.signingKeys = [{
          ...exampleKey2,
          purpose: ['id_token'] // Wrong purpose
        }];

        try {
          await generateAuthorizationRequest({
            workflow: testWorkflow,
            exchange: mockExchange,
            requestUrl: mockRequestUrl,
            profile: 'OID4VP-1.0',
            responseMode: 'dc_api',
            clientIdScheme: 'x509_san_dns'
          });
          expect().fail('Should have thrown an error');
        } catch(error) {
          expect(error.message).to.contain(
            'No signing key with purpose authorization_request found'
          );
        } finally {
          // Restore original keys
          config.opencred.signingKeys = originalKeys;
        }
      });

    it('should preserve other authorization request fields with x509_san_dns',
      async function() {
        const result = await generateAuthorizationRequest({
          workflow: testWorkflow,
          exchange: mockExchange,
          requestUrl: mockRequestUrl,
          profile: 'OID4VP-1.0',
          responseMode: 'dc_api',
          clientIdScheme: 'x509_san_dns'
        });

        expect(result.authorizationRequest.response_type).to.equal('vp_token');
        expect(result.authorizationRequest.response_mode).to.equal('dc_api');
        expect(result.authorizationRequest.nonce).to.equal(
          mockExchange.challenge
        );
        expect(result.authorizationRequest.state).to.be.a('string');
        expect(result.authorizationRequest.response_uri).to.be.a('string');
      });
  });
});

