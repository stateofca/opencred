/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {decodeJwt} from 'jose';
import expect from 'expect.js';
import {klona} from 'klona';

import {
  _buildDcqlQueryForMdoc,
  _encodeSessionTranscript,
  _generateEphemeralKeyAgreementPair,
  _getX5cFromSigningKey,
  _pemToBase64Der,
  handleNative18013AnnexDRequest,
} from '../../lib/workflows/native-18013-7.js';
import {
  convertDerCertificateToPem,
  generateCertificateChain
} from '../utils/x509.js';

import {baseUrl} from '../mock-data.js';
import {config} from '@bedrock/core';
import {createExchangeWithAuthRequest} from '../utils/exchanges.js';
import {database} from '../../lib/database.js';
import {exampleKey2} from '../fixtures/signingKeys.js';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';

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
    redirectUri: 'https://example.com',
    scopes: [{name: 'openid'}],
  },
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
    redirectUri: 'https://example.com',
    scopes: [{name: 'openid'}],
  },
};

describe('Native 18013-7-Annex-D Workflow - Unit Tests', function() {
  describe('_encodeSessionTranscript', function() {
    it('should encode session transcript with all required fields', function() {
      const sessionTranscript = {
        mdocGeneratedNonce: 'nonce1',
        clientId: 'did:web:example.com',
        responseUri: 'https://example.com/response',
        verifierGeneratedNonce: 'nonce2'
      };

      const result = _encodeSessionTranscript(sessionTranscript);
      expect(result).to.be.a(Uint8Array);
      expect(result.length).to.be.greaterThan(0);
    });

    it('should handle missing fields gracefully', function() {
      const sessionTranscript = {
        mdocGeneratedNonce: 'nonce1',
        clientId: 'did:web:example.com',
        responseUri: 'https://example.com/response',
        verifierGeneratedNonce: undefined
      };

      const result = _encodeSessionTranscript(sessionTranscript);
      expect(result).to.be.a(Uint8Array);
    });
  });

  describe('_buildDcqlQueryForMdoc', function() {
    it('should build DCQL query from mdoc query items', async function() {
      const rp = klona(mdocTestRP);
      const exchange = {
        id: 'test-exchange',
        challenge: 'test-challenge',
        variables: {}
      };

      const result = await _buildDcqlQueryForMdoc({rp, exchange});
      expect(result).to.be.an('object');
      expect(result.credentials).to.be.an('array');
      expect(result.credentials.length).to.be.greaterThan(0);
      expect(result.credentials[0].format).to.equal('mso_mdoc');
    });

    it('should throw error when no mdoc format items found', async function() {
      const rp = {
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
        await _buildDcqlQueryForMdoc({rp, exchange});
        expect().fail('Should have thrown an error');
      } catch(error) {
        expect(error.message).to.contain(
          'No query items with mso_mdoc format found'
        );
      }
    });

    it('should filter to mdoc only w/mixed format queries', async function() {
      const rp = klona(mixedFormatTestRP);
      const exchange = {
        id: 'test-exchange',
        challenge: 'test-challenge',
        variables: {}
      };

      const result = await _buildDcqlQueryForMdoc({rp, exchange});
      expect(result).to.be.an('object');
      expect(result.credentials).to.be.an('array');
      // Should only include mdoc credentials
      for(const cred of result.credentials) {
        expect(cred.format).to.equal('mso_mdoc');
      }
    });

    it('should ensure all credentials have mso_mdoc format', async function() {
      const rp = klona(mdocTestRP);
      const exchange = {
        id: 'test-exchange',
        challenge: 'test-challenge',
        variables: {}
      };

      const result = await _buildDcqlQueryForMdoc({rp, exchange});
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
  describe('handleNative18013AnnexDRequest', function() {
    it('should generate complete authorization request with mdoc query',
      async function() {
        const exchange = await createExchangeWithAuthRequest({
          rp: mdocTestRP,
          profile: 'OID4VP-HAIP-1.0'
        });
        const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/request`;

        const result = await handleNative18013AnnexDRequest({
          rp: mdocTestRP,
          exchange,
          requestUrl,
          baseUri: 'https://example.com',
          signingKeys: [{...exampleKey2, purpose: ['authorization_request']}],
          profile: 'OID4VP-HAIP-1.0'
        });

        expect(result).to.have.property('jwt');
        expect(result).to.have.property('updatedExchange');
        expect(result.jwt).to.be.a('string');
        expect(result.updatedExchange.state).to.equal('active');
        expect(result.updatedExchange.variables).to.have.property(
          'authorizationRequest'
        );
        expect(result.updatedExchange.variables).to.have.property(
          'ephemeralKeyAgreementPrivateKey'
        );
        expect(result.updatedExchange.variables).to.have.property(
          'mdocGeneratedNonce'
        );

        // Verify HAIP-compliant behavior
        const jwt = decodeJwt(result.jwt);
        expect(jwt.response_mode).to.equal('dc_api.jwt');
        expect(jwt.client_metadata).to.have.property('vp_formats_supported');
        expect(jwt.client_metadata).to.not.have.property('vp_formats');
        expect(jwt.client_metadata.vp_formats_supported.mso_mdoc).to.eql({
          alg: ['ES256']
        });
        expect(jwt.client_metadata).to.have.property('jwks');
        expect(jwt.client_metadata).to.have.property(
          'encrypted_response_enc_values_supported'
        );
        expect(jwt.client_metadata.encrypted_response_enc_values_supported)
          .to.eql(['A128GCM', 'A256GCM']);
      });

    it('should include correct JWT structure and claims', async function() {
      // Using default profile OID4VP-1.0
      const exchange = await createExchangeWithAuthRequest({rp: mdocTestRP});
      const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
        `${exchange.id}/openid/client/authorization/request`;

      const result = await handleNative18013AnnexDRequest({
        rp: mdocTestRP,
        exchange,
        requestUrl,
        baseUri: 'https://example.com',
        signingKeys: [{...exampleKey2, purpose: ['authorization_request']}]
      });

      const jwt = decodeJwt(result.jwt);
      // Native 18013-7 uses x509_san_dns client_id scheme
      expect(jwt.client_id).to.equal('x509_san_dns:example.com');
      expect(jwt.client_id_scheme).to.equal('x509_san_dns');
      expect(jwt.response_type).to.equal('vp_token');
      // Default profile uses dc_api (unencrypted) response mode
      expect(jwt.response_mode).to.equal('dc_api');
      expect(jwt).to.have.property('expected_origins');
      expect(jwt.expected_origins).to.eql(['https://example.com']);
      expect(jwt).to.have.property('nonce');
      expect(jwt).to.have.property('state');
      expect(jwt).to.have.property('dcql_query');
      expect(jwt).to.have.property('client_metadata');
      // Default profile uses vp_formats (not vp_formats_supported)
      expect(jwt.client_metadata).to.have.property('vp_formats');
      expect(jwt.client_metadata.vp_formats.mso_mdoc).to.eql({
        alg: ['ES256']
      });
    });

    it('should build correct direct_post response URL', async function() {
      const exchange = await createExchangeWithAuthRequest({
        rp: mdocTestRP,
        responseMode: 'direct_post'
      });
      const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
        `${exchange.id}/openid/client/authorization/request` +
        '?response_mode=direct_post';

      const result = await handleNative18013AnnexDRequest({
        rp: mdocTestRP,
        exchange,
        requestUrl,
        baseUri: 'https://example.com',
        signingKeys: [{...exampleKey2, purpose: ['authorization_request']}]
      });

      const jwt = decodeJwt(result.jwt);
      expect(jwt.response_uri).to.equal(
        'https://example.com/workflows/mdoc-test/exchanges/' +
        `${exchange.id}/openid/client/authorization/response`
      );
    });

    it('should store exchange variables correctly', async function() {
      const exchange = await createExchangeWithAuthRequest({rp: mdocTestRP});
      const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
        `${exchange.id}/openid/client/authorization/request`;

      const result = await handleNative18013AnnexDRequest({
        rp: mdocTestRP,
        exchange,
        requestUrl,
        baseUri: 'https://example.com',
        signingKeys: [{...exampleKey2, purpose: ['authorization_request']}],
        profile: 'OID4VP-HAIP-1.0'
      });

      const {variables} = result.updatedExchange;
      expect(variables.authorizationRequest).to.be.an('object');
      expect(variables.ephemeralKeyAgreementPrivateKey).to.be.an('object');
      expect(variables.ephemeralKeyAgreementPrivateKey).to.have.property('kid');
      expect(variables.mdocGeneratedNonce).to.be.a('string');
    });

    it('should throw error when no mdoc query items', async function() {
      const rp = {
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
      const requestUrl = `/workflows/${rp.clientId}/exchanges/` +
        `${exchange.id}/openid/client/authorization/request`;

      try {
        await handleNative18013AnnexDRequest({
          rp,
          exchange,
          requestUrl,
          baseUri: 'https://example.com',
          signingKeys: [{...exampleKey2, purpose: ['authorization_request']}]
        });
        expect().fail('Should have thrown an error');
      } catch(error) {
        expect(error.message).to.contain(
          'No query items with mso_mdoc format found'
        );
      }
    });

    it('should throw error when no signing key found', async function() {
      const exchange = await createExchangeWithAuthRequest({rp: mdocTestRP});
      const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
        `${exchange.id}/openid/client/authorization/request`;

      try {
        await handleNative18013AnnexDRequest({
          rp: mdocTestRP,
          exchange,
          requestUrl,
          baseUri: 'https://example.com',
          signingKeys: []
        });
        expect().fail('Should have thrown an error');
      } catch(error) {
        expect(error.message).to.contain(
          'No signing key with purpose authorization_request found'
        );
      }
    });

    it('should include x5c header when certs available', async function() {
      const {chain} = await generateCertificateChain({length: 2});
      const certPem = convertDerCertificateToPem(chain[0].raw);
      const signingKey = {
        ...exampleKey2,
        purpose: ['authorization_request'],
        certificatePem: certPem
      };

      const exchange = await createExchangeWithAuthRequest({rp: mdocTestRP});
      const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
        `${exchange.id}/openid/client/authorization/request`;

      const result = await handleNative18013AnnexDRequest({
        rp: mdocTestRP,
        exchange,
        requestUrl,
        baseUri: 'https://example.com',
        signingKeys: [signingKey]
      });

      // Decode JWT header to check for x5c
      const parts = result.jwt.split('.');
      const header = JSON.parse(
        Buffer.from(parts[0], 'base64url').toString('utf-8')
      );
      expect(header).to.have.property('x5c');
      expect(header.x5c).to.be.an('array');
      expect(header.x5c.length).to.be.greaterThan(0);
    });

    it('should include jwks in client_metadata when x5c is not present',
      async function() {
        const exchange = await createExchangeWithAuthRequest({rp: mdocTestRP});
        const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/request`;

        // Use exampleKey2 without certificates, so x5c will be empty
        const result = await handleNative18013AnnexDRequest({
          rp: mdocTestRP,
          exchange,
          requestUrl,
          baseUri: 'https://example.com',
          signingKeys: [{...exampleKey2, purpose: ['authorization_request']}],
          profile: 'OID4VP-HAIP-1.0'
        });

        const jwt = decodeJwt(result.jwt);
        expect(jwt.client_metadata).to.be.an('object');
        expect(jwt.client_metadata.vp_formats_supported).to.be.an('object');
        expect(jwt.client_metadata.vp_formats_supported.mso_mdoc)
          .to.be.an('object');
        expect(jwt.client_metadata.vp_formats_supported.mso_mdoc.alg)
          .to.eql(['ES256']);
        // jwks should be present when x5c is not available
        expect(jwt.client_metadata.jwks).to.be.an('object');
        expect(jwt.client_metadata.jwks.keys).to.be.an('array');
        expect(jwt.client_metadata.jwks.keys.length).to.equal(1);
        expect(jwt.client_metadata.encrypted_response_enc_values_supported)
          .to.eql(['A128GCM', 'A256GCM']);
      });

    it('should not include jwks in client_metadata when x5c is present',
      async function() {
        const {chain} = await generateCertificateChain({length: 2});
        const certPem = convertDerCertificateToPem(chain[0].raw);
        const signingKey = {
          ...exampleKey2,
          purpose: ['authorization_request'],
          certificatePem: certPem
        };

        const exchange = await createExchangeWithAuthRequest({rp: mdocTestRP});
        const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/request`;

        const result = await handleNative18013AnnexDRequest({
          rp: mdocTestRP,
          exchange,
          requestUrl,
          baseUri: 'https://example.com',
          signingKeys: [signingKey],
          profile: 'OID4VP-HAIP-1.0'
        });

        const jwt = decodeJwt(result.jwt);
        expect(jwt.client_metadata).to.be.an('object');
        expect(jwt.client_metadata.vp_formats_supported).to.be.an('object');
        expect(jwt.client_metadata.vp_formats_supported.mso_mdoc)
          .to.be.an('object');
        // jwks should NOT be present when x5c is available
        expect(jwt.client_metadata.jwks).to.be(undefined);
        expect(jwt.client_metadata.encrypted_response_enc_values_supported)
          .to.eql(['A128GCM', 'A256GCM']);
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
        const exchange = await createExchangeWithAuthRequest({rp: mdocTestRP});
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
          'application/oauth-authz-req+jwt; charset=utf-8'
        );
        const jwt = decodeJwt(await result.text());
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
        const exchange = await createExchangeWithAuthRequest({rp: mdocTestRP});
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
              `?responseMode=dc_api`
            );
        } catch(e) {
          err = e;
        }
        expect(err).to.be(undefined);
        expect(result.status).to.equal(200);
        const jwt = decodeJwt(await result.text());
        expect(jwt.response_mode).to.equal('dc_api');
        expect(jwt).to.have.property('response_uri');
      });

    it('should use dc_api.jwt response mode and generate ephemeral key ' +
      'when responseMode=dc_api.jwt', async function() {
      const exchange = await createExchangeWithAuthRequest({rp: mdocTestRP});
      findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves({...exchange, workflowId: mdocTestRP.clientId});
      const updateOneStub = sinon.stub(
        database.collections.Exchanges, 'updateOne'
      ).resolves();

      let result;
      let err;
      try {
        result = await client
          .get(
            `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
            `${exchange.id}/openid/client/authorization/request` +
            `?responseMode=dc_api.jwt`
          );
      } catch(e) {
        err = e;
      }
      expect(err).to.be(undefined);
      expect(result.status).to.equal(200);
      const jwt = decodeJwt(await result.text());
      expect(jwt.response_mode).to.equal('dc_api.jwt');
      expect(jwt.client_metadata).to.have.property('jwks');
      expect(jwt.client_metadata.jwks.keys).to.be.an('array');
      expect(jwt.client_metadata.jwks.keys.length).to.equal(1);

      // Verify that updateOne was called with ephemeral key
      const updateCall = updateOneStub.getCall(0);
      expect(updateCall).to.not.be(undefined);
      const updateSet = updateCall.args[1].$set;
      expect(updateSet['variables.ephemeralKeyAgreementPrivateKey'])
        .to.be.an('object');
      expect(updateSet['variables.ephemeralKeyAgreementPrivateKey'])
        .to.have.property('kid');
      updateOneStub.restore();
    });

    it('should default to direct_post when responseMode is not provided',
      async function() {
        const exchange = await createExchangeWithAuthRequest({rp: mdocTestRP});
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
              `${exchange.id}/openid/client/authorization/request`
            );
        } catch(e) {
          err = e;
        }
        expect(err).to.be(undefined);
        expect(result.status).to.equal(200);
        const jwt = decodeJwt(await result.text());
        expect(jwt.response_mode).to.equal('direct_post');
      });
  });
});

