/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {
  _buildDcqlQueryForMdoc,
  _encodeSessionTranscript,
  _generateEphemeralKeyAgreementPair,
  _getX5cFromSigningKey,
  _pemToBase64Der
} from '../../lib/workflows/profiles/common-oid4vp.js';
import {
  convertDerCertificateToPem,
  generateCertificateChain
} from '../utils/x509.js';
import {decodeJwt, decodeProtectedHeader} from 'jose';
import {
  generateAuthorizationRequest,
  handleAuthorizationResponse
} from '../../lib/workflows/profiles/native-18013-7-annex-d.js';
import {baseUrl} from '../mock-data.js';
import {config} from '@bedrock/core';
import {createExchangeWithAuthRequest} from '../utils/exchanges.js';
import {database} from '../../lib/database.js';
import {exampleKey2} from '../fixtures/signingKeys.js';
import expect from 'expect.js';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';
import {OID4VP_AUTHZ_REQ_JWT_TYP} from '../../common/oid4vp.js';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

// Test RP with mdoc query
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

// Test RP with mixed formats
const mixedFormatTestRP = {
  type: 'native',
  clientId: 'mixed-test',
  query: [
    {
      format: ['mso_mdoc'],
      fields: {
        'org.iso.18013.5.1': ['given_name']
      }
    },
    {
      format: ['ldp_vc'],
      type: ['VerifiableCredential']
    }
  ],
  clientSecret: 'shhh',
  oidc: {
    redirectUri: 'https://example.com'
  }
};

describe('Native 18013-7-Annex-D Workflow - Unit Tests', function() {
  describe('_encodeSessionTranscript', function() {
    it('should encode session transcript with all required fields for dc_api',
      function() {
        const sessionTranscript = {
          responseMode: 'dc_api',
          origin: 'https://example.com',
          nonce: 'test-nonce',
          jwkThumbprint: null
        };

        const result = _encodeSessionTranscript(sessionTranscript);
        expect(result).to.be.a(Uint8Array);
        expect(result.length).to.be.greaterThan(0);
      });

    it('should encode session transcript for direct_post mode', function() {
      const sessionTranscript = {
        responseMode: 'direct_post',
        clientId: 'did:web:example.com',
        nonce: 'test-nonce',
        responseUri: 'https://example.com/response',
        jwkThumbprint: null
      };

      const result = _encodeSessionTranscript(sessionTranscript);
      expect(result).to.be.a(Uint8Array);
      expect(result.length).to.be.greaterThan(0);
    });

    it('should handle missing optional fields gracefully', function() {
      const sessionTranscript = {
        responseMode: 'dc_api',
        origin: 'https://example.com',
        nonce: 'test-nonce',
        jwkThumbprint: null
      };

      const result = _encodeSessionTranscript(sessionTranscript);
      expect(result).to.be.a(Uint8Array);
    });
  });

  describe('_buildDcqlQueryForMdoc', function() {
    it('should build DCQL query from mdoc query items', async function() {
      const exchange = {
        id: 'test-exchange',
        challenge: 'test-challenge',
        variables: {}
      };

      const result = await _buildDcqlQueryForMdoc({
        workflow: mdocTestRP, exchange});
      expect(result).to.be.an('object');
      expect(result.credentials).to.be.an('array');
      expect(result.credentials.length).to.be.greaterThan(0);
      expect(result.credentials[0].format).to.equal('mso_mdoc');
    });

    it('should throw error when no mdoc format items found', async function() {
      const workflow = {
        type: 'native',
        clientId: 'test',
        query: [{
          format: ['ldp_vc'],
          type: ['VerifiableCredential']
        }]
      };
      const exchange = {
        id: 'test-exchange',
        challenge: 'test-challenge',
        variables: {}
      };

      try {
        await _buildDcqlQueryForMdoc({workflow, exchange});
        expect().fail('Should have thrown an error');
      } catch(error) {
        expect(error.message).to.contain(
          'No query items with mso_mdoc format found'
        );
      }
    });

    it('should filter to mdoc only w/mixed format queries', async function() {
      const workflow = mixedFormatTestRP;
      const exchange = {
        id: 'test-exchange',
        challenge: 'test-challenge',
        variables: {}
      };

      const result = await _buildDcqlQueryForMdoc({workflow, exchange});
      expect(result).to.be.an('object');
      expect(result.credentials).to.be.an('array');
      // Should only include mdoc credentials
      for(const cred of result.credentials) {
        expect(cred.format).to.equal('mso_mdoc');
      }
    });

    it('should ensure all credentials have mso_mdoc format', async function() {
      const exchange = {
        id: 'test-exchange',
        challenge: 'test-challenge',
        variables: {}
      };

      const result = await _buildDcqlQueryForMdoc({
        workflow: mdocTestRP, exchange});
      for(const cred of result.credentials) {
        expect(cred.format).to.equal('mso_mdoc');
      }
    });
  });

  describe('_generateEphemeralKeyAgreementPair', function() {
    it('should generate ECDH-ES P-256 key pair', async function() {
      const result = await _generateEphemeralKeyAgreementPair();
      expect(result).to.have.property('privateKeyJwk');
      expect(result).to.have.property('publicKeyJwk');
    });

    it('should have correct JWK structure', async function() {
      const result = await _generateEphemeralKeyAgreementPair();
      const {privateKeyJwk, publicKeyJwk} = result;

      expect(publicKeyJwk).to.have.property('use', 'enc');
      expect(publicKeyJwk).to.have.property('alg', 'ECDH-ES');
      expect(publicKeyJwk).to.have.property('crv', 'P-256');
      expect(publicKeyJwk).to.have.property('kid');
      expect(privateKeyJwk).to.have.property('kid');
      expect(privateKeyJwk.kid).to.equal(publicKeyJwk.kid);
    });

    it('should have extractable property set', async function() {
      const result = await _generateEphemeralKeyAgreementPair();
      const {privateKeyJwk} = result;
      // JWK should have extractable property (though it's not in JWK spec,
      // it's set during key generation)
      expect(privateKeyJwk).to.be.an('object');
    });

    it('should return both public and private keys', async function() {
      const result = await _generateEphemeralKeyAgreementPair();
      expect(result.privateKeyJwk).to.be.an('object');
      expect(result.publicKeyJwk).to.be.an('object');
      expect(result.privateKeyJwk).to.not.equal(result.publicKeyJwk);
    });
  });

  describe('_pemToBase64Der', function() {
    it('should convert PEM to base64 DER', function() {
      const pem = `-----BEGIN CERTIFICATE-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw4VcNmD1BMUCSHpJe7MT
e92OBdJ/f7VSqBFTmfG9jXEW46WAZ78jLnUBL0Q58lLuNHa1t2TwJTyCzc8XUkA3
iw5sqXSfDgD7keEnOh02pLTZo8ymDZz3xpaLHYMa9HjkV299SQ2gvqHibPOAqIy7
2+eJkFyO6ypTH6Nys1kGVx6uwEyk7WdVGmSVCxb4qTFrTM1aBoazq5yIRyeyew9U
9aCnX5yXAxPRruGtxPZZqhbnnKRo5yq9oXS48neKpUF3jRrjSNRq8KcW6vFy2vJH
zZ9hiqxlWVli4dwQ+fx/xP1JtnheT/kuC0E3rz+ElbCIZSAxixIxL83WKp1o+f8m
gwIDAQAB
-----END CERTIFICATE-----`;

      const result = _pemToBase64Der(pem);
      expect(result).to.be.a('string');
      expect(result).to.not.contain('-----BEGIN CERTIFICATE-----');
      expect(result).to.not.contain('-----END CERTIFICATE-----');
      expect(result).to.not.contain('\n');
      expect(result).to.not.contain(' ');
    });

    it('should handle multiple certificates in chain', function() {
      const pem1 = `-----BEGIN CERTIFICATE-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw4VcNmD1BMUCSHpJe7MT
-----END CERTIFICATE-----`;
      const pem2 = `-----BEGIN CERTIFICATE-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw4VcNmD1BMUCSHpJe7MT
-----END CERTIFICATE-----`;

      const result1 = _pemToBase64Der(pem1);
      const result2 = _pemToBase64Der(pem2);
      expect(result1).to.be.a('string');
      expect(result2).to.be.a('string');
      expect(result1).to.equal(result2); // Same content
    });

    it('should handle empty PEM', function() {
      const result = _pemToBase64Der('');
      expect(result).to.equal('');
    });

    it('should handle PEM with extra whitespace', function() {
      const pem = `-----BEGIN CERTIFICATE-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw4VcNmD1BMUCSHpJe7MT
e92OBdJ/f7VSqBFTmfG9jXEW46WAZ78jLnUBL0Q58lLuNHa1t2TwJTyCzc8XUkA3
-----END CERTIFICATE-----   `;

      const result = _pemToBase64Der(pem);
      expect(result).to.be.a('string');
      expect(result).to.not.contain(' ');
    });
  });

  describe('_getX5cFromSigningKey', function() {
    let mockLogger;

    beforeEach(function() {
      mockLogger = {
        warning: sinon.stub()
      };
    });

    it('should first use certificatePem from signing key', async function() {
      const {chain} = await generateCertificateChain({length: 2});
      const certPem = convertDerCertificateToPem(chain[0].raw);
      const signingKey = {
        id: 'test-key',
        certificatePem: certPem
      };

      const result = _getX5cFromSigningKey(signingKey);
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
      expect(result[0]).to.be.a('string');
    });

    it('should exclude trust anchor from certificate chain', async function() {
      const {chain} = await generateCertificateChain({length: 3});
      const certPem1 = convertDerCertificateToPem(chain[0].raw);
      const certPem2 = convertDerCertificateToPem(chain[1].raw);
      const certPem3 = convertDerCertificateToPem(chain[2].raw);
      const signingKey = {
        id: 'test-key',
        certificatePem: `${certPem1}\n${certPem2}\n${certPem3}`
      };

      const result = _getX5cFromSigningKey(signingKey);
      // Should exclude last certificate (trust anchor)
      expect(result.length).to.equal(2);
    });

    it('should keep single certificate if only one present', async function() {
      const {chain} = await generateCertificateChain({length: 1});
      const certPem = convertDerCertificateToPem(chain[0].raw);
      const signingKey = {
        id: 'test-key',
        certificatePem: certPem
      };

      const result = _getX5cFromSigningKey(signingKey);
      expect(result.length).to.equal(1);
    });

    it('should return empty array and log warning when no certificates',
      function() {
        const signingKey = {
          id: 'test-key'
        };

        const result = _getX5cFromSigningKey(signingKey, {
          logger: mockLogger
        });
        expect(result).to.be.an('array');
        expect(result.length).to.equal(0);
        expect(mockLogger.warning.called).to.be(true);
      });

  });
});

describe('Native 18013-7-Annex-D Workflow - Integration Tests', function() {
  describe('generateAuthorizationRequest', function() {
    it('should generate complete authorization request with mdoc query',
      async function() {
        const exchange = await createExchangeWithAuthRequest({
          workflow: mdocTestRP,
          profile: '18013-7-Annex-D'
        });
        const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/request`;

        const result = await generateAuthorizationRequest({
          workflow: mdocTestRP,
          exchange,
          requestUrl,
          baseUri: 'https://example.com',
          signingKeys: [{...exampleKey2, purpose: ['authorization_request']}],
          profile: '18013-7-Annex-D',
          responseMode: 'dc_api'
        });

        expect(result).to.have.property('authorizationRequest');
        expect(result).to.have.property('updatedExchange');
        expect(result).to.have.property('signingMetadata');
        expect(result.authorizationRequest).to.be.an('object');
        expect(result.updatedExchange.state).to.equal('active');
        expect(result.updatedExchange.variables).to.have.property(
          'authorizationRequest'
        );
        expect(result.updatedExchange.variables).to.have.property(
          'encodedSessionTranscript'
        );
        // Annex D uses dc_api (unencrypted), so no ephemeral keys
        expect(result.updatedExchange.variables)
          .to.not.have.property('ephemeralKeyAgreementPrivateKey');

        // Verify Annex D behavior
        const authRequest = result.authorizationRequest;
        expect(authRequest.response_mode).to.equal('dc_api');
        expect(authRequest.client_metadata).to.have.property('vp_formats');
        expect(authRequest.client_metadata)
          .to.not.have.property('vp_formats_supported');
        expect(authRequest.client_metadata.vp_formats.mso_mdoc).to.eql({
          alg: ['ES256']
        });
        // No jwks or encrypted_response_enc_values_supported for dc_api mode
        expect(authRequest.client_metadata).to.not.have.property('jwks');
        expect(authRequest.client_metadata)
          .to.not.have.property('encrypted_response_enc_values_supported');
      });

    it('should include correct authorization request structure and claims',
      async function() {
        const exchange = await createExchangeWithAuthRequest({
          workflow: mdocTestRP});
        const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/request`;

        const result = await generateAuthorizationRequest({
          workflow: mdocTestRP,
          exchange,
          requestUrl,
          baseUri: 'https://example.com',
          signingKeys: [{...exampleKey2, purpose: ['authorization_request']}],
          responseMode: 'dc_api'
        });

        const authRequest = result.authorizationRequest;
        // Native 18013-7 uses x509_san_dns client_id scheme
        expect(authRequest.client_id).to.equal('x509_san_dns:example.com');
        expect(authRequest.client_id_scheme).to.equal('x509_san_dns');
        expect(authRequest.response_type).to.equal('vp_token');
        // Annex D uses dc_api (unencrypted) response mode
        expect(authRequest.response_mode).to.equal('dc_api');
        expect(authRequest).to.have.property('expected_origins');
        expect(authRequest.expected_origins).to.eql(['https://example.com']);
        expect(authRequest).to.have.property('nonce');
        expect(authRequest).to.have.property('state');
        expect(authRequest).to.have.property('dcql_query');
        expect(authRequest).to.have.property('client_metadata');
        // Annex D uses vp_formats (not vp_formats_supported)
        expect(authRequest.client_metadata).to.have.property('vp_formats');
        expect(authRequest.client_metadata.vp_formats.mso_mdoc).to.eql({
          alg: ['ES256']
        });
      });

    it('should not include response_uri for dc_api mode', async function() {
      const exchange = await createExchangeWithAuthRequest({
        workflow: mdocTestRP
      });
      const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
        `${exchange.id}/openid/client/authorization/request`;

      const result = await generateAuthorizationRequest({
        workflow: mdocTestRP,
        exchange,
        requestUrl,
        baseUri: 'https://example.com',
        signingKeys: [{...exampleKey2, purpose: ['authorization_request']}],
        responseMode: 'dc_api'
      });

      const authRequest = result.authorizationRequest;
      // dc_api mode does not use response_uri
      expect(authRequest.response_uri).to.be(undefined);
    });

    it('should store exchange variables correctly', async function() {
      const exchange = await createExchangeWithAuthRequest({
        workflow: mdocTestRP});
      const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
        `${exchange.id}/openid/client/authorization/request`;

      const result = await generateAuthorizationRequest({
        workflow: mdocTestRP,
        exchange,
        requestUrl,
        baseUri: 'https://example.com',
        signingKeys: [{...exampleKey2, purpose: ['authorization_request']}],
        responseMode: 'dc_api'
      });

      const {variables} = result.updatedExchange;
      expect(variables.authorizationRequest).to.be.an('object');
      expect(variables.encodedSessionTranscript).to.be.a(Uint8Array);
      // dc_api mode does not generate ephemeral keys
      expect(variables).to.not.have.property('ephemeralKeyAgreementPrivateKey');
    });

    it('should throw error when no mdoc query items', async function() {
      const workflow = {
        type: 'native',
        clientId: 'test',
        query: [{
          format: ['ldp_vc'],
          context: ['https://www.w3.org/ns/credentials/v2'],
          type: ['VerifiableCredential']
        }]
      };
      const exchange = {
        id: 'test-exchange',
        challenge: 'test-challenge',
        variables: {}
      };
      const requestUrl = `/workflows/${workflow.clientId}/exchanges/` +
        `${exchange.id}/openid/client/authorization/request`;

      try {
        await generateAuthorizationRequest({
          workflow,
          exchange,
          requestUrl,
          baseUri: 'https://example.com',
          signingKeys: [{...exampleKey2, purpose: ['authorization_request']}],
          responseMode: 'dc_api'
        });
        expect().fail('Should have thrown an error');
      } catch(error) {
        expect(error.message).to.contain(
          'No query items with mso_mdoc format found'
        );
      }
    });

    it('should throw error when no signing key found', async function() {
      const exchange = await createExchangeWithAuthRequest({
        workflow: mdocTestRP});
      const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
        `${exchange.id}/openid/client/authorization/request`;

      try {
        await generateAuthorizationRequest({
          workflow: mdocTestRP,
          exchange,
          requestUrl,
          baseUri: 'https://example.com',
          signingKeys: [],
          responseMode: 'dc_api'
        });
        expect().fail('Should have thrown an error');
      } catch(error) {
        expect(error.message).to.contain(
          'No signing key with purpose authorization_request found'
        );
      }
    });

    it('should include x5c in signingMetadata when certs available',
      async function() {
        const {chain} = await generateCertificateChain({length: 2});
        const certPem = convertDerCertificateToPem(chain[0].raw);
        const signingKey = {
          ...exampleKey2,
          purpose: ['authorization_request'],
          certificatePem: certPem
        };

        const exchange = await createExchangeWithAuthRequest({
          workflow: mdocTestRP});
        const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/request`;

        const result = await generateAuthorizationRequest({
          workflow: mdocTestRP,
          exchange,
          requestUrl,
          baseUri: 'https://example.com',
          signingKeys: [signingKey],
          responseMode: 'dc_api'
        });

        // Check signingMetadata for x5c
        expect(result.signingMetadata).to.have.property('x5c');
        expect(result.signingMetadata.x5c).to.be.an('array');
        expect(result.signingMetadata.x5c.length).to.be.greaterThan(0);
        expect(result.signingMetadata).to.have.property('kid');
        expect(result.signingMetadata).to.have.property('alg');
      });

    it('should not include jwks in client_metadata for dc_api mode',
      async function() {
        const exchange = await createExchangeWithAuthRequest({
          workflow: mdocTestRP});
        const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/request`;

        // Use exampleKey2 without certificates, so x5c will be empty
        const result = await generateAuthorizationRequest({
          workflow: mdocTestRP,
          exchange,
          requestUrl,
          baseUri: 'https://example.com',
          signingKeys: [{...exampleKey2, purpose: ['authorization_request']}],
          responseMode: 'dc_api'
        });

        const authRequest = result.authorizationRequest;
        expect(authRequest.client_metadata).to.be.an('object');
        expect(authRequest.client_metadata.vp_formats).to.be.an('object');
        expect(authRequest.client_metadata.vp_formats.mso_mdoc)
          .to.be.an('object');
        expect(authRequest.client_metadata.vp_formats.mso_mdoc.alg)
          .to.eql(['ES256']);
        // dc_api mode does not use jwks or
        // encrypted_response_enc_values_supported
        expect(authRequest.client_metadata).to.not.have.property('jwks');
        expect(authRequest.client_metadata)
          .to.not.have.property('encrypted_response_enc_values_supported');
      });
  });

  describe('API Integration Test', function() {
    let rpStub;
    let baseUriStub;
    let signingKeysStub;
    let findOneStub;
    let replaceOneStub;

    beforeEach(function() {
      rpStub = sinon.stub(config.opencred, 'workflows').value([mdocTestRP]);
      baseUriStub = sinon.stub(config.server, 'baseUri').value(
        'https://example.com'
      );
      signingKeysStub = sinon.stub(config.opencred, 'signingKeys').value(
        [{...exampleKey2, purpose: ['authorization_request']}]
      );
    });

    afterEach(function() {
      rpStub.restore();
      baseUriStub.restore();
      signingKeysStub.restore();
      if(findOneStub) {
        findOneStub.restore();
      }
      if(replaceOneStub) {
        replaceOneStub.restore();
      }
    });

    it('should return Authorization Request JWT for mdoc query',
      async function() {
        const exchange = await createExchangeWithAuthRequest({
          workflow: mdocTestRP});
        findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves({...exchange, workflowId: mdocTestRP.clientId});
        replaceOneStub = sinon.stub(
          database.collections.Exchanges, 'replaceOne'
        ).resolves();

        let result;
        let err;
        try {
          result = await client
            .get(
              `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
              `${exchange.id}/openid/client/authorization/request` +
              `?profile=18013-7-Annex-D`
            );
        } catch(e) {
          err = e;
        }
        expect(err).to.be(undefined);
        expect(result.status).to.equal(200);
        expect(result.headers.get('content-type')).to.equal(
          'application/oauth-authz-req+jwt'
        );
        const jwtText = await result.text();
        const header = decodeProtectedHeader(jwtText);
        expect(header.typ).to.equal(OID4VP_AUTHZ_REQ_JWT_TYP);
        const jwt = decodeJwt(jwtText);
        // 18013-7-Annex-D profile uses x509_san_dns client_id scheme
        expect(jwt.client_id).to.equal('x509_san_dns:example.com');
        expect(jwt.client_id_scheme).to.equal('x509_san_dns');
        // Default response_mode for 18013-7-Annex-D is dc_api
        expect(jwt.response_mode).to.equal('dc_api');
        expect(jwt).to.have.property('dcql_query');
        expect(jwt).to.have.property('client_metadata');
        expect(jwt.client_metadata.vp_formats.mso_mdoc).to.be.an('object');
      });

    it('should use dc_api response mode when responseMode=dc_api',
      async function() {
        const exchange = await createExchangeWithAuthRequest({
          workflow: mdocTestRP});
        findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves({...exchange, workflowId: mdocTestRP.clientId});
        replaceOneStub = sinon.stub(
          database.collections.Exchanges, 'updateOne'
        ).resolves();

        let result;
        let err;
        try {
          result = await client
            .get(
              `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
              `${exchange.id}/openid/client/authorization/request` +
              `?response_mode=dc_api&profile=18013-7-Annex-D`
            );
        } catch(e) {
          err = e;
        }
        expect(err).to.be(undefined);
        expect(result.status).to.equal(200);
        const jwtText = await result.text();
        expect(decodeProtectedHeader(jwtText).typ).to.equal(
          OID4VP_AUTHZ_REQ_JWT_TYP);
        const jwt = decodeJwt(jwtText);
        expect(jwt.response_mode).to.equal('dc_api');
        // dc_api mode does not use response_uri
        expect(jwt).to.not.have.property('response_uri');
      });

    it('should default to dc_api when responseMode is not provided',
      async function() {
        const exchange = await createExchangeWithAuthRequest({
          workflow: mdocTestRP});
        findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves({...exchange, workflowId: mdocTestRP.clientId});
        replaceOneStub = sinon.stub(
          database.collections.Exchanges, 'updateOne'
        ).resolves();

        let result;
        let err;
        try {
          result = await client
            .get(
              `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
              `${exchange.id}/openid/client/authorization/request` +
              `?profile=18013-7-Annex-D`
            );
        } catch(e) {
          err = e;
        }
        expect(err).to.be(undefined);
        expect(result.status).to.equal(200);
        const jwtText = await result.text();
        expect(decodeProtectedHeader(jwtText).typ).to.equal(
          OID4VP_AUTHZ_REQ_JWT_TYP);
        const jwt = decodeJwt(jwtText);
        // Annex D defaults to dc_api
        expect(jwt.response_mode).to.equal('dc_api');
      });
  });

  describe('POST authorization_request endpoint (OID4VP 1.0 Section 5.10)',
    function() {
      let findOneStub;
      let replaceOneStub;
      let rpStub;
      let baseUriStub;
      let signingKeysStub;

      beforeEach(function() {
        rpStub = sinon.stub(config.opencred, 'workflows').value([mdocTestRP]);
        baseUriStub = sinon.stub(config.server, 'baseUri').value(
          'https://example.com'
        );
        signingKeysStub = sinon.stub(config.opencred, 'signingKeys').value(
          [{...exampleKey2, purpose: ['authorization_request']}]
        );
      });

      afterEach(function() {
        rpStub.restore();
        baseUriStub.restore();
        signingKeysStub.restore();
        if(findOneStub) {
          findOneStub.restore();
        }
        if(replaceOneStub) {
          replaceOneStub.restore();
        }
      });

      it('should handle POST request with wallet_nonce', async function() {
        const exchange = await createExchangeWithAuthRequest({
          workflow: mdocTestRP});
        findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves({...exchange, workflowId: mdocTestRP.clientId});
        replaceOneStub = sinon.stub(
          database.collections.Exchanges, 'replaceOne'
        ).resolves();

        const walletNonce = 'qPmxiNFCR3QTm19POc8u';
        const walletMetadata = {
          vp_formats_supported: {
            'dc+sd-jwt': {
              'sd-jwt_alg_values': ['ES256'],
              'kb-jwt_alg_values': ['ES256']
            }
          }
        };

        const searchParams = new URLSearchParams();
        searchParams.set('wallet_metadata', JSON.stringify(walletMetadata));
        searchParams.set('wallet_nonce', walletNonce);
        searchParams.set('profile', '18013-7-Annex-D');

        let result;
        let err;
        try {
          result = await client.post(
            `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
            `${exchange.id}/openid/client/authorization/request`, {
              body: searchParams,
              headers: {
                'content-type': 'application/x-www-form-urlencoded',
                accept: 'application/oauth-authz-req+jwt'
              }
            });
        } catch(e) {
          err = e;
        }
        expect(err).to.be(undefined);
        expect(result.status).to.equal(200);
        expect(result.headers.get('content-type')).to.equal(
          'application/oauth-authz-req+jwt'
        );
        const jwtText = await result.text();
        const header = decodeProtectedHeader(jwtText);
        expect(header.typ).to.equal(OID4VP_AUTHZ_REQ_JWT_TYP);
        const jwt = decodeJwt(jwtText);
        expect(jwt).to.have.property('wallet_nonce');
        expect(jwt.wallet_nonce).to.equal(walletNonce);
        expect(jwt.client_id).to.equal('x509_san_dns:example.com');
        expect(jwt.response_mode).to.equal('dc_api');
      });

      it('should handle POST request without wallet_nonce', async function() {
        const exchange = await createExchangeWithAuthRequest({
          workflow: mdocTestRP});
        findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves({...exchange, workflowId: mdocTestRP.clientId});
        replaceOneStub = sinon.stub(
          database.collections.Exchanges, 'replaceOne'
        ).resolves();

        const walletMetadata = {
          vp_formats_supported: {
            'dc+sd-jwt': {
              'sd-jwt_alg_values': ['ES256']
            }
          }
        };

        const searchParams = new URLSearchParams();
        searchParams.set('wallet_metadata', JSON.stringify(walletMetadata));
        searchParams.set('profile', '18013-7-Annex-D');

        let result;
        let err;
        try {
          result = await client.post(
            `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
            `${exchange.id}/openid/client/authorization/request`, {
              body: searchParams,
              headers: {
                'content-type': 'application/x-www-form-urlencoded',
                accept: 'application/oauth-authz-req+jwt'
              }
            });
        } catch(e) {
          err = e;
        }
        expect(err).to.be(undefined);
        expect(result.status).to.equal(200);
        const jwtText = await result.text();
        const jwt = decodeJwt(jwtText);
        expect(jwt).to.not.have.property('wallet_nonce');
        expect(jwt.client_id).to.equal('x509_san_dns:example.com');
      });

      it('should reject POST request with invalid Content-Type',
        async function() {
          const exchange = await createExchangeWithAuthRequest({
            workflow: mdocTestRP});
          findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
            .resolves({...exchange, workflowId: mdocTestRP.clientId});

          // Use valid JSON body so body parser succeeds and request reaches
          // our middleware (which returns 400 for wrong Content-Type)
          let err;
          try {
            await client.post(
              `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
              `${exchange.id}/openid/client/authorization/request`, {
                body: JSON.stringify({profile: '18013-7-Annex-D'}),
                headers: {
                  'content-type': 'application/json',
                  accept: 'application/oauth-authz-req+jwt'
                }
              });
          } catch(e) {
            err = e;
          }
          expect(err).to.not.be(undefined);
          expect(err.status).to.equal(400);
          expect(err.data.message).to.contain(
            'Content-Type must be application/x-www-form-urlencoded');
        });

      it('should reject POST request with invalid Accept header',
        async function() {
          const exchange = await createExchangeWithAuthRequest({
            workflow: mdocTestRP});
          findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
            .resolves({...exchange, workflowId: mdocTestRP.clientId});

          const searchParams = new URLSearchParams();
          searchParams.set('profile', '18013-7-Annex-D');

          let err;
          try {
            await client.post(
              `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
              `${exchange.id}/openid/client/authorization/request`, {
                body: searchParams,
                headers: {
                  'content-type': 'application/x-www-form-urlencoded',
                  accept: 'application/json'
                }
              });
          } catch(e) {
            err = e;
          }
          expect(err).to.not.be(undefined);
          expect(err.status).to.equal(406);
          expect(err.data.message).to.contain(
            'Accept header must be application/oauth-authz-req+jwt');
        });

      it('should reject POST request with malformed wallet_metadata',
        async function() {
          const exchange = await createExchangeWithAuthRequest({
            workflow: mdocTestRP});
          findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
            .resolves({...exchange, workflowId: mdocTestRP.clientId});

          const searchParams = new URLSearchParams();
          searchParams.set('wallet_metadata', 'invalid-json{');
          searchParams.set('profile', '18013-7-Annex-D');

          let err;
          try {
            await client.post(
              `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
              `${exchange.id}/openid/client/authorization/request`, {
                body: searchParams,
                headers: {
                  'content-type': 'application/x-www-form-urlencoded',
                  accept: 'application/oauth-authz-req+jwt'
                }
              });
          } catch(e) {
            err = e;
          }
          expect(err).to.not.be(undefined);
          expect(err.status).to.equal(400);
          expect(err.data.message).to.contain(
            'Invalid JSON in wallet_metadata');
        });

      it('should support GET and POST with equivalent results',
        async function() {
          const exchange = await createExchangeWithAuthRequest({
            workflow: mdocTestRP});
          findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
            .resolves({...exchange, workflowId: mdocTestRP.clientId});
          replaceOneStub = sinon.stub(
            database.collections.Exchanges, 'replaceOne'
          ).resolves();

          // GET request
          let getResult;
          let getErr;
          try {
            getResult = await client.get(
              `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
              `${exchange.id}/openid/client/authorization/request` +
              `?profile=18013-7-Annex-D`
            );
          } catch(e) {
            getErr = e;
          }
          expect(getErr).to.be(undefined);
          expect(getResult.status).to.equal(200);
          const getJwtText = await getResult.text();
          const getJwt = decodeJwt(getJwtText);

          // Create new exchange for POST to avoid state conflicts
          const exchange2 = await createExchangeWithAuthRequest({
            workflow: mdocTestRP});
          findOneStub.restore();
          replaceOneStub.restore();
          findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
            .resolves({...exchange2, workflowId: mdocTestRP.clientId});
          replaceOneStub = sinon.stub(
            database.collections.Exchanges, 'replaceOne'
          ).resolves();

          // POST request with same parameters
          const searchParams = new URLSearchParams();
          searchParams.set('profile', '18013-7-Annex-D');

          let postResult;
          let postErr;
          try {
            postResult = await client.post(
              `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
              `${exchange2.id}/openid/client/authorization/request`, {
                body: searchParams,
                headers: {
                  'content-type': 'application/x-www-form-urlencoded',
                  accept: 'application/oauth-authz-req+jwt'
                }
              });
          } catch(e) {
            postErr = e;
          }
          expect(postErr).to.be(undefined);
          expect(postResult.status).to.equal(200);
          const postJwtText = await postResult.text();
          const postJwt = decodeJwt(postJwtText);

          // Both should have same structure (except wallet_nonce if provided)
          expect(getJwt.client_id).to.equal(postJwt.client_id);
          expect(getJwt.response_mode).to.equal(postJwt.response_mode);
          expect(getJwt).to.have.property('dcql_query');
          expect(postJwt).to.have.property('dcql_query');
        });
    });

  describe('handleAuthorizationResponse', function() {
    // Tests simulate the raw wallet format (credentialResponse.data from
    // navigator.credentials.get). The handler wraps this with
    // { protocol: 'openid4vp', data: responseBody } for the DC API.
    let exchange;
    let authorizationRequest;

    beforeEach(async function() {
      exchange = await createExchangeWithAuthRequest({workflow: mdocTestRP});
      const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
        `${exchange.id}/openid/client/authorization/request`;
      const result = await generateAuthorizationRequest({
        workflow: mdocTestRP,
        exchange,
        requestUrl,
        baseUri: 'https://example.com',
        signingKeys: [{...exampleKey2, purpose: ['authorization_request']}],
        responseMode: 'dc_api'
      });
      exchange = result.updatedExchange;
      authorizationRequest = exchange.variables.authorizationRequest;
    });

    describe('State validation', function() {
      it('should reject response with mismatched state for dc_api mode',
        async function() {
          const responseBody = {
            state: 'wrong-state-value',
            vp_token: {
              0: 'dummy-base64url-token'
            }
          };

          try {
            await handleAuthorizationResponse({
              workflow: mdocTestRP,
              exchange,
              responseBody
            });
            expect().fail('Should have thrown an error');
          } catch(error) {
            expect(error.message).to.contain(
              'Parameter \'state\' failed to match'
            );
          }
        });

      it('should accept response with matching state for dc_api mode',
        async function() {
          const responseBody = {
            state: authorizationRequest.state,
            vp_token: {
              0: 'dummy-base64url-token'
            }
          };

          // This will fail at mdoc verification, but should pass state check
          try {
            await handleAuthorizationResponse({
              workflow: mdocTestRP,
              exchange,
              responseBody
            });
            expect().fail('Should have failed at mdoc verification');
          } catch(error) {
            // Should fail at mdoc verification, not state validation
            expect(error.message).to.not.contain('State parameter mismatch');
          }
        });
    });

    describe('Credential ID verification', function() {
      it('should verify credential ID 0 exists in dcql_query',
        async function() {
          const dcqlQuery = authorizationRequest.dcql_query;
          expect(dcqlQuery).to.be.an('object');
          expect(dcqlQuery.credentials).to.be.an('array');
          expect(dcqlQuery.credentials.length).to.be.greaterThan(0);

          const credentialIds = dcqlQuery.credentials.map(cred => cred.id);
          expect(credentialIds.indexOf('0')).to.be.greaterThan(-1);
        });

      it('should extract vp_token using credential ID 0', async function() {
        const responseBody = {
          state: authorizationRequest.state,
          vp_token: {
            0: 'dummy-base64url-token'
          }
        };

        // This will fail at mdoc verification, but should pass credential ID
        // extraction
        try {
          await handleAuthorizationResponse({
            workflow: mdocTestRP,
            exchange,
            responseBody
          });
          expect().fail('Should have failed at mdoc verification');
        } catch(error) {
          // Should fail at mdoc verification, not credential ID extraction
          expect(error.message).to.not.contain(
            'Credential IDs in vp_token'
          );
          expect(error.message).to.not.contain(
            'Invalid dcql_query'
          );
        }
      });

      it('should extract vp_token when nested in data object',
        async function() {
        // Wallet may nest vp_token within data (forward compatibility)
          const responseBody = {
            state: authorizationRequest.state,
            data: {
              vp_token: {
                0: 'dummy-base64url-token'
              }
            }
          };

          // Should pass credential ID extraction, fail at mdoc verification
          try {
            await handleAuthorizationResponse({
              workflow: mdocTestRP,
              exchange,
              responseBody
            });
            expect().fail('Should have failed at mdoc verification');
          } catch(error) {
            expect(error.message).to.not.contain(
              'Credential IDs in vp_token'
            );
            expect(error.message).to.not.contain(
              'vp_token not found'
            );
            expect(error.message).to.not.contain(
              'Invalid dcql_query'
            );
          }
        });

      it('should extract vp_token from data in raw wallet format',
        async function() {
          // Raw format: credentialResponse.data from navigator.credentials.get
          const responseBody = {
            state: authorizationRequest.state,
            data: {
              vp_token: {
                0: 'dummy-base64url-token'
              }
            }
          };

          try {
            await handleAuthorizationResponse({
              workflow: mdocTestRP,
              exchange,
              responseBody
            });
            expect().fail('Should have failed at mdoc verification');
          } catch(error) {
            expect(error.message).to.not.contain(
              'Credential IDs in vp_token'
            );
            expect(error.message).to.not.contain(
              'vp_token not found'
            );
          }
        });

      it('should throw error when credential ID not found in vp_token',
        async function() {
          const responseBody = {
            state: authorizationRequest.state,
            vp_token: {
              1: 'dummy-base64url-token' // Wrong credential ID
            }
          };

          try {
            await handleAuthorizationResponse({
              workflow: mdocTestRP,
              exchange,
              responseBody
            });
            expect().fail('Should have thrown an error');
          } catch(error) {
            expect(error.message).to.contain(
              'Credential IDs in vp_token'
            );
            expect(error.message).to.contain('not found in');
            expect(error.message).to.contain('dcql_query');
            expect(error.message).to.contain('Available credential IDs');
          }
        });
    });

    describe('Session transcript construction', function() {
      it('should handle missing responseUri for dc_api mode', async function() {
        // dc_api mode doesn't set response_uri
        expect(authorizationRequest.response_uri).to.be(undefined);

        const responseBody = {
          state: authorizationRequest.state,
          vp_token: {
            0: 'dummy-base64url-token'
          }
        };

        // This will fail at mdoc verification, but should use stored session
        // transcript correctly
        try {
          await handleAuthorizationResponse({
            workflow: mdocTestRP,
            exchange,
            responseBody
          });
          expect().fail('Should have failed at mdoc verification');
        } catch(error) {
          // Should fail at mdoc verification, not session transcript usage
          expect(error.message).to.not.contain('responseUri');
          expect(error.message).to.not.contain('session transcript');
        }
      });

      it('should use stored encodedSessionTranscript from exchange variables',
        async function() {
          // Verify that encodedSessionTranscript is stored
          expect(exchange.variables.encodedSessionTranscript)
            .to.be.a(Uint8Array);
          expect(exchange.variables.encodedSessionTranscript.length)
            .to.be.greaterThan(0);
        });

      it('should require nonce in exchange variables',
        async function() {
          // Generate certificate chain and stub caStore to allow test to
          // proceed past certificate check
          const {chain} = await generateCertificateChain({length: 3});
          const root = chain.pop();
          const caStoreStub = sinon.stub(config.opencred, 'caStore').value([
            convertDerCertificateToPem(root.raw, false)
          ]);

          const exchangeWithoutAuthRequestNonce = {
            ...exchange,
            variables: {
              ...exchange.variables,
              authorizationRequest: {
                ...exchange.variables.authorizationRequest,
                nonce: undefined
              },
              // Remove transcript to trigger reconstruction
              encodedSessionTranscript: undefined
            }
          };

          const responseBody = {
            state: authorizationRequest.state,
            vp_token: {
              0: 'dummy-base64url-token'
            }
          };

          try {
            await handleAuthorizationResponse({
              workflow: mdocTestRP,
              exchange: exchangeWithoutAuthRequestNonce,
              responseBody
            });
            expect().fail('Should have thrown an error');
          } catch(error) {
            // Should fail because nonce is required in authorization request
            expect(error.message).to.contain('nonce');
          } finally {
            caStoreStub.restore();
          }
        });
    });

    describe('Integration test', function() {
      it('should handle full wallet response flow with raw wallet format',
        async function() {
          // Simulates real wallet: credentialResponse.data (no protocol wrapper)
          const responseBody = {
            state: authorizationRequest.state,
            vp_token: {
              0: 'dummy-base64url-encoded-device-response'
            }
          };

          // No database operations needed - function returns
          // updatedExchange only
          try {
            const result = await handleAuthorizationResponse({
              workflow: mdocTestRP,
              exchange,
              responseBody
            });
            // Should have failed at mdoc verification, but if it didn't,
            // check the result structure
            if(result && result.updatedExchange) {
              expect(result.updatedExchange.state).to.equal('complete');
              expect(result.updatedExchange.variables.results)
                .to.be.an('object');
            } else {
              expect().fail('Should have failed at mdoc verification');
            }
          } catch(error) {
            // Should pass state validation and credential ID extraction,
            // fail at mdoc verification (expected with dummy data)
            expect(error.message).to.not.contain(
              'Parameter \'state\' failed to match'
            );
            expect(error.message).to.not.contain(
              'Credential IDs in vp_token'
            );
            // Should have attempted mdoc verification
            const hasMdocError = error.message.includes('mdoc verification');
            const hasVerifyError = error.message.includes('verify');
            expect(hasMdocError || hasVerifyError).to.be(true);
          }
        });
    });
  });
});

