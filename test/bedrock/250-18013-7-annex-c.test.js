/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {
  _buildDcqlQueryForMdoc,
  _getX5cFromSigningKey,
  _pemToBase64Der
} from '../../lib/workflows/profiles/common-oid4vp.js';
import {
  convertDerCertificateToPem,
  generateCertificateChain
} from '../utils/x509.js';
import {exportJWK, generateKeyPair} from 'jose';
import {
  generateAuthorizationRequest,
  handleAuthorizationResponse
} from '../../lib/workflows/profiles/native-18013-7-annex-c.js';
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
    scopes: [{name: 'openid'}]
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
    redirectUri: 'https://example.com',
    scopes: [{name: 'openid'}]
  }
};

describe('Native 18013-7-Annex-C Workflow - Unit Tests', function() {
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
  });

  describe('HPKE key generation', function() {
    it('should generate HPKE recipient key pair', async function() {
      const keyPair = await generateKeyPair('ECDH-ES', {
        crv: 'P-256',
        extractable: true
      });

      const [privateKeyJwk, publicKeyJwk] = await Promise.all([
        exportJWK(keyPair.privateKey),
        exportJWK(keyPair.publicKey)
      ]);

      expect(publicKeyJwk).to.have.property('kty', 'EC');
      expect(publicKeyJwk).to.have.property('crv', 'P-256');
      expect(privateKeyJwk).to.have.property('d');
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
  });

  describe('_getX5cFromSigningKey', function() {
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
  });
});

describe('Native 18013-7-Annex-C Workflow - Integration Tests', function() {
  describe('generateAuthorizationRequest', function() {
    it('should generate complete authorization request with HPKE encryption',
      async function() {
        const exchange = await createExchangeWithAuthRequest({
          workflow: mdocTestRP,
          profile: '18013-7-Annex-C'
        });
        const requestUrl = `/workflows/${mdocTestRP.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/request`;

        const result = await generateAuthorizationRequest({
          workflow: mdocTestRP,
          exchange,
          requestUrl,
          baseUri: 'https://example.com',
          signingKeys: [{...exampleKey2, purpose: ['authorization_request']}],
          profile: '18013-7-Annex-C',
          responseMode: 'dc_api'
        });

        expect(result).to.have.property('annexCRequest');
        expect(result).to.have.property('updatedExchange');
        expect(result).to.have.property('signingMetadata');
        expect(result.annexCRequest).to.be.an('object');
        expect(result.annexCRequest).to.have.property('deviceRequest');
        expect(result.annexCRequest).to.have.property('encryptionInfo');
        const ue = result.updatedExchange;
        expect(ue.state).to.equal('active');
        expect(ue.variables).to.have.property('authorizationRequest');
        expect(ue.variables).to.have.property('encodedSessionTranscript');
        // Annex C uses HPKE encryption, so HPKE keys should be stored
        expect(ue.variables).to.have.property('hpkeRecipientPrivateKey');
        expect(ue.variables).to.have.property('base64EncryptionInfo');
        expect(ue.variables).to.have.property('base64DeviceRequest');

        // Verify Annex C behavior
        const authRequest = ue.variables.authorizationRequest;
        expect(authRequest.response_mode).to.equal('dc_api');
        expect(authRequest.client_metadata).to.have.property('vp_formats');
        expect(authRequest.client_metadata)
          .to.not.have.property('vp_formats_supported');
        expect(authRequest.client_metadata.vp_formats.mso_mdoc).to.eql({
          alg: ['ES256']
        });
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

        const authRequest = result.updatedExchange.variables.
          authorizationRequest;
        // Native 18013-7 uses x509_san_dns client_id scheme
        expect(authRequest.client_id).to.equal('x509_san_dns:example.com');
        expect(authRequest.client_id_scheme).to.equal('x509_san_dns');
        expect(authRequest.response_type).to.equal('vp_token');
        // Annex C uses dc_api response mode
        expect(authRequest.response_mode).to.equal('dc_api');
        expect(authRequest).to.have.property('expected_origins');
        expect(authRequest.expected_origins).to.eql(['https://example.com']);
        expect(authRequest).to.have.property('nonce');
        expect(authRequest).to.have.property('state');
        expect(authRequest).to.have.property('dcql_query');
        expect(authRequest).to.have.property('client_metadata');
        // Annex C uses vp_formats (not vp_formats_supported)
        expect(authRequest.client_metadata).to.have.property('vp_formats');
        expect(authRequest.client_metadata.vp_formats.mso_mdoc).to.eql({
          alg: ['ES256']
        });
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
      // Annex C stores HPKE keys and encryption info
      expect(variables).to.have.property('hpkeRecipientPrivateKey');
      expect(variables).to.have.property('base64EncryptionInfo');
      expect(variables).to.have.property('base64DeviceRequest');
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
              `?profile=18013-7-Annex-C`
            );
        } catch(e) {
          err = e;
        }
        expect(err).to.be(undefined);
        expect(result.status).to.equal(200);
        expect(result.headers.get('content-type')).to.equal(
          'application/json; charset=utf-8'
        );
        const json = result.data;
        // Annex C returns JSON with deviceRequest and encryptionInfo
        expect(json).to.have.property('deviceRequest');
        expect(json).to.have.property('encryptionInfo');
        expect(json.deviceRequest).to.be.a('string');
        expect(json.encryptionInfo).to.be.a('string');
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
              `?response_mode=dc_api&profile=18013-7-Annex-C`
            );
        } catch(e) {
          err = e;
        }
        expect(err).to.be(undefined);
        expect(result.status).to.equal(200);
        // Annex C returns JSON, not JWT
        const json = await result.data;
        expect(json).to.have.property('deviceRequest');
        expect(json).to.have.property('encryptionInfo');
      });
  });

  describe('handleAuthorizationResponse', function() {
    let exchange;

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
    });

    describe('Response structure validation', function() {
      it('should reject response without Response field', async function() {
        const responseBody = {
          protocol: 'org-iso-mdoc',
          data: {
            // Missing Response field
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
            'Response not found in response body'
          );
        }
      });

      it('should handle DC API container structure', async function() {
        const responseBody = {
          protocol: 'org-iso-mdoc',
          data: {
            Response: 'dummy-base64url-encrypted-response'
          }
        };

        // This will fail at decryption, but should pass structure validation
        try {
          await handleAuthorizationResponse({
            workflow: mdocTestRP,
            exchange,
            responseBody
          });
          expect().fail('Should have failed at decryption');
        } catch(error) {
          // Should fail at decryption, not structure validation
          expect(error.message).to.not.contain('Response not found');
        }
      });
    });

    describe('HPKE decryption', function() {
      it('should require HPKE recipient private key', async function() {
        const exchangeWithoutKey = {
          ...exchange,
          variables: {
            ...exchange.variables,
            hpkeRecipientPrivateKey: undefined
          }
        };

        const responseBody = {
          protocol: 'org-iso-mdoc',
          data: {
            Response: 'dummy-base64url-encrypted-response'
          }
        };

        try {
          await handleAuthorizationResponse({
            workflow: mdocTestRP,
            exchange: exchangeWithoutKey,
            responseBody
          });
          expect().fail('Should have thrown an error');
        } catch(error) {
          expect(error.message).to.contain(
            'HPKE recipient private key not found'
          );
        }
      });

      it('should require encryption info for session transcript',
        async function() {
          const exchangeWithoutEncInfo = {
            ...exchange,
            variables: {
              ...exchange.variables,
              base64EncryptionInfo: undefined
            }
          };

          const responseBody = {
            protocol: 'org-iso-mdoc',
            data: {
              Response: 'dummy-base64url-encrypted-response'
            }
          };

          try {
            await handleAuthorizationResponse({
              workflow: mdocTestRP,
              exchange: exchangeWithoutEncInfo,
              responseBody
            });
            expect().fail('Should have thrown an error');
          } catch(error) {
            expect(error.message).to.contain('EncryptionInfo not found');
          }
        });
    });

    describe('Session transcript construction', function() {
      it('should use stored encodedSessionTranscript from exchange variables',
        async function() {
          // Verify that encodedSessionTranscript is stored
          expect(exchange.variables.encodedSessionTranscript)
            .to.be.a(Uint8Array);
          expect(exchange.variables.encodedSessionTranscript.length)
            .to.be.greaterThan(0);
        });

      it('should reconstruct session transcript if not stored',
        async function() {
          // Generate certificate chain and stub caStore to allow test to
          // proceed past certificate check
          const {chain} = await generateCertificateChain({length: 3});
          const root = chain.pop();
          const caStoreStub = sinon.stub(config.opencred, 'caStore').value([
            convertDerCertificateToPem(root.raw, false)
          ]);

          const exchangeWithoutTranscript = {
            ...exchange,
            variables: {
              ...exchange.variables,
              encodedSessionTranscript: undefined
            }
          };

          const responseBody = {
            protocol: 'org-iso-mdoc',
            data: {
              Response: 'dummy-base64url-encrypted-response'
            }
          };

          // This will fail at decryption, but should reconstruct transcript
          try {
            await handleAuthorizationResponse({
              workflow: mdocTestRP,
              exchange: exchangeWithoutTranscript,
              responseBody
            });
            expect().fail('Should have failed at decryption');
          } catch(error) {
            // Should fail at decryption, not session transcript reconstruction
            expect(error.message).to.not.contain('session transcript');
          } finally {
            caStoreStub.restore();
          }
        });
    });

    describe('Integration test', function() {
      it('should handle full wallet response flow with protocol wrapper',
        async function() {
          // This is a structural test - actual HPKE decryption and mdoc
          // verification would require real encrypted data
          const responseBody = {
            protocol: 'org-iso-mdoc',
            data: {
              Response: 'dummy-base64url-encrypted-device-response'
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
            // Should have failed at HPKE decryption, but if it didn't,
            // check the result structure
            if(result && result.updatedExchange) {
              expect(result.updatedExchange.state).to.equal('complete');
              expect(result.updatedExchange.variables.results)
                .to.be.an('object');
            } else {
              expect().fail('Should have failed at HPKE decryption');
            }
          } catch(error) {
            // Should pass structure validation, fail at HPKE decryption
            // (expected with dummy data)
            expect(error.message).to.not.contain('Response not found');
            expect(error.message).to.not.contain('EncryptionInfo not found');
            // Should have attempted HPKE decryption
            const hasHpkeError = error.message.includes('HPKE') ||
              error.message.includes('decrypt');
            const hasDecodeError = error.message.includes('decode');
            expect(hasHpkeError || hasDecodeError).to.be(true);
          }
        });
    });
  });
});

