/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {generateAuthorizationRequest as generateStandard} from
  '../../lib/workflows/profiles/native-oid4vp-standard.js';

describe('OID4VP Client Metadata', () => {
  const mockExchange = {
    challenge: 'test-challenge-123'
  };

  const mockDomain = 'https://example.com';
  const mockUrl = '/workflows/test/exchanges/123/openid/client/' +
    'authorization/request';

  describe('OID4VP-draft18 profile', () => {
    it('should include vp_formats with jwt_vp_json and ldp_vp', async () => {
      const workflow = {
        query: [{
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const {authorizationRequest} = await generateStandard({
        workflow,
        exchange: mockExchange,
        baseUri: mockDomain,
        requestUrl: mockUrl,
        userAgent: '',
        signingKeys: [],
        profile: 'OID4VP-combined',
        responseMode: 'direct_post'
      });

      expect(authorizationRequest).to.have.property('client_metadata');
      expect(authorizationRequest.client_metadata)
        .to.have.property('vp_formats');
      expect(authorizationRequest.client_metadata.vp_formats)
        .to.have.property('jwt_vp_json');
      expect(authorizationRequest.client_metadata.vp_formats)
        .to.have.property('ldp_vp');
    });

    it('should have correct structure for jwt_vp_json', async () => {
      const workflow = {
        query: [{
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const {authorizationRequest} = await generateStandard({
        workflow,
        exchange: mockExchange,
        baseUri: mockDomain,
        requestUrl: mockUrl,
        userAgent: '',
        signingKeys: [],
        profile: 'OID4VP-combined',
        responseMode: 'direct_post'
      });

      const jwtVpJson = authorizationRequest.client_metadata.vp_formats
        .jwt_vp_json;
      expect(jwtVpJson).to.be.an('object');
      expect(jwtVpJson).to.have.property('alg');
      expect(jwtVpJson.alg).to.be.an('array');
      expect(jwtVpJson.alg).to.contain('ES256');
      expect(jwtVpJson).to.have.property('alg_values');
      expect(jwtVpJson.alg_values).to.be.an('array');
      expect(jwtVpJson.alg_values).to.contain('ES256');
    });

    it('should have correct structure for ldp_vp', async () => {
      const workflow = {
        query: [{
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          format: ['ldp_vc']
        }]
      };

      const {authorizationRequest} = await generateStandard({
        workflow,
        exchange: mockExchange,
        baseUri: mockDomain,
        requestUrl: mockUrl,
        userAgent: '',
        signingKeys: [],
        profile: 'OID4VP-combined',
        responseMode: 'direct_post'
      });

      const ldpVp = authorizationRequest.client_metadata.vp_formats.ldp_vp;
      expect(ldpVp).to.be.an('object');
      expect(ldpVp).to.have.property('proof_type');
      expect(ldpVp.proof_type).to.be.an('array');
      expect(ldpVp.proof_type).to.contain('ecdsa-rdfc-2019');
    });
  });

  describe('OID4VP-1.0 profile', () => {
    it('should include vp_formats_supported with jwt_vc_json and ldp_vc keys',
      async () => {
        const workflow = {
          query: [{
            context: ['https://www.w3.org/2018/credentials/v1'],
            type: ['VerifiableCredential'],
            format: ['jwt_vc_json']
          }]
        };

        const {authorizationRequest} = await generateStandard({
          workflow,
          exchange: mockExchange,
          baseUri: mockDomain,
          requestUrl: mockUrl,
          userAgent: '',
          signingKeys: [],
          profile: 'OID4VP-1.0',
          responseMode: 'direct_post'
        });

        expect(authorizationRequest).to.have.property('client_metadata');
        expect(authorizationRequest.client_metadata)
          .to.have.property('vp_formats_supported');
        expect(authorizationRequest.client_metadata.vp_formats_supported)
          .to.have.property('jwt_vc_json');
        expect(authorizationRequest.client_metadata.vp_formats_supported)
          .to.have.property('ldp_vc');
      });

    it('should have correct 1.0 structure for jwt_vc_json', async () => {
      const workflow = {
        query: [{
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const {authorizationRequest} = await generateStandard({
        workflow,
        exchange: mockExchange,
        baseUri: mockDomain,
        requestUrl: mockUrl,
        userAgent: '',
        signingKeys: [],
        profile: 'OID4VP-1.0',
        responseMode: 'direct_post'
      });

      const jwtVcJson =
        authorizationRequest.client_metadata.vp_formats_supported.jwt_vc_json;
      expect(jwtVcJson).to.be.an('object');
      expect(jwtVcJson).to.have.property('alg');
      expect(jwtVcJson.alg).to.be.an('array');
      expect(jwtVcJson.alg).to.contain('ES256');
      expect(jwtVcJson).to.have.property('alg_values');
      expect(jwtVcJson.alg_values).to.be.an('array');
      expect(jwtVcJson.alg_values).to.contain('ES256');
    });

    it('should have correct 1.0 structure for ldp_vc', async () => {
      const workflow = {
        query: [{
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          format: ['ldp_vc']
        }]
      };

      const {authorizationRequest} = await generateStandard({
        workflow,
        exchange: mockExchange,
        baseUri: mockDomain,
        requestUrl: mockUrl,
        userAgent: '',
        signingKeys: [],
        profile: 'OID4VP-1.0',
        responseMode: 'direct_post'
      });

      const ldpVc = authorizationRequest.client_metadata.vp_formats_supported
        .ldp_vc;
      expect(ldpVc).to.be.an('object');
      expect(ldpVc).to.have.property('proof_type');
      expect(ldpVc.proof_type).to.be.an('array');
      expect(ldpVc.proof_type).to.contain('ecdsa-rdfc-2019');
      expect(ldpVc).to.have.property('proof_type_values');
      expect(ldpVc.proof_type_values).to.be.an('array');
      expect(ldpVc.proof_type_values).to.contain('DataIntegrityProof');
      expect(ldpVc).to.have.property('cryptosuite_values');
      expect(ldpVc.cryptosuite_values).to.be.an('array');
      expect(ldpVc.cryptosuite_values).to.contain('ecdsa-rdfc-2019');
    });
  });

  describe('OID4VP-combined profile', () => {
    it('OID4VP-combined: both vp_formats and vp_formats_supported',
      async () => {
        const workflow = {
          query: [{
            context: ['https://www.w3.org/2018/credentials/v1'],
            type: ['VerifiableCredential'],
            format: ['jwt_vc_json']
          }]
        };

        const {authorizationRequest} = await generateStandard({
          workflow,
          exchange: mockExchange,
          baseUri: mockDomain,
          requestUrl: mockUrl,
          userAgent: '',
          signingKeys: [],
          profile: 'OID4VP-combined',
          responseMode: 'direct_post'
        });

        expect(authorizationRequest.client_metadata)
          .to.have.property('vp_formats');
        expect(authorizationRequest.client_metadata)
          .to.have.property('vp_formats_supported');
      });

    it('OID4VP-combined: different keys in vp_formats vs vp_formats_supported',
      async () => {
        const workflow = {
          query: [{
            context: ['https://www.w3.org/2018/credentials/v1'],
            type: ['VerifiableCredential'],
            format: ['jwt_vc_json']
          }]
        };

        const {authorizationRequest} = await generateStandard({
          workflow,
          exchange: mockExchange,
          baseUri: mockDomain,
          requestUrl: mockUrl,
          userAgent: '',
          signingKeys: [],
          profile: 'OID4VP-combined',
          responseMode: 'direct_post'
        });

        // Draft 18 should use jwt_vp_json and ldp_vp
        expect(authorizationRequest.client_metadata.vp_formats)
          .to.have.property('jwt_vp_json');
        expect(authorizationRequest.client_metadata.vp_formats)
          .to.have.property('ldp_vp');
        expect(authorizationRequest.client_metadata.vp_formats)
          .to.not.have.property('jwt_vc_json');
        expect(authorizationRequest.client_metadata.vp_formats)
          .to.not.have.property('ldp_vc');

        // OID4VP 1.0 should use jwt_vc_json and ldp_vc
        expect(authorizationRequest.client_metadata.vp_formats_supported)
          .to.have.property('jwt_vc_json');
        expect(authorizationRequest.client_metadata.vp_formats_supported)
          .to.have.property('ldp_vc');
        expect(authorizationRequest.client_metadata.vp_formats_supported)
          .to.not.have.property('jwt_vp_json');
        expect(authorizationRequest.client_metadata.vp_formats_supported)
          .to.not.have.property('ldp_vp');
      });

    it('OID4VP-combined: both formats with query RP', async () => {
      const workflow = {
        query: [{
          type: ['TestCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const {authorizationRequest} = await generateStandard({
        workflow,
        exchange: mockExchange,
        baseUri: mockDomain,
        requestUrl: mockUrl,
        userAgent: '',
        signingKeys: [],
        profile: 'OID4VP-combined',
        responseMode: 'direct_post'
      });

      expect(authorizationRequest.client_metadata)
        .to.have.property('vp_formats');
      expect(authorizationRequest.client_metadata)
        .to.have.property('vp_formats_supported');
    });

    it('OID4VP-combined: both formats with query RP', async () => {
      const workflow = {
        query: [{
          context: [
            'https://www.w3.org/2018/credentials/v1',
            'https://w3id.org/vdl/v1'
          ],
          type: ['Iso18013DriversLicenseCredential']
        }],
        description: 'Test description'
      };

      const {authorizationRequest} = await generateStandard({
        workflow,
        exchange: mockExchange,
        baseUri: mockDomain,
        requestUrl: mockUrl,
        userAgent: '',
        signingKeys: [],
        profile: 'OID4VP-combined',
        responseMode: 'direct_post'
      });

      expect(authorizationRequest.client_metadata)
        .to.have.property('vp_formats');
      expect(authorizationRequest.client_metadata)
        .to.have.property('vp_formats_supported');
    });

    it('OID4VP-combined: both formats with verifiablePresentationRequest RP',
      async () => {
        const workflow = {
          query: [{
            context: [
              'https://www.w3.org/2018/credentials/v1',
              'https://w3id.org/vdl/v1'
            ],
            type: ['Iso18013DriversLicenseCredential']
          }],
          verifiablePresentationRequest: JSON.stringify({
            query: {
              type: 'QueryByExample',
              credentialQuery: {
                reason: 'Please present your Driver\'s License',
                example: {
                  '@context': [
                    'https://www.w3.org/2018/credentials/v1',
                    'https://w3id.org/vdl/v1'
                  ],
                  type: ['Iso18013DriversLicenseCredential']
                }
              }
            }
          })
        };

        const {authorizationRequest} = await generateStandard({
          workflow,
          exchange: mockExchange,
          baseUri: mockDomain,
          requestUrl: mockUrl,
          userAgent: '',
          signingKeys: [],
          profile: 'OID4VP-combined',
          responseMode: 'direct_post'
        });

        expect(authorizationRequest.client_metadata)
          .to.have.property('vp_formats');
        expect(authorizationRequest.client_metadata)
          .to.have.property('vp_formats_supported');
      });

    it('OID4VP-combined: all required client_metadata fields', async () => {
      const workflow = {
        query: [{
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const {authorizationRequest} = await generateStandard({
        workflow,
        exchange: mockExchange,
        baseUri: mockDomain,
        requestUrl: mockUrl,
        userAgent: '',
        signingKeys: [],
        profile: 'OID4VP-combined',
        responseMode: 'direct_post'
      });

      expect(authorizationRequest.client_metadata)
        .to.have.property('client_name');
      expect(authorizationRequest.client_metadata).to.have.property(
        'subject_syntax_types_supported');
      const subjectSyntaxTypes =
        authorizationRequest.client_metadata.subject_syntax_types_supported;
      expect(subjectSyntaxTypes).to.be.an('array');
      expect(subjectSyntaxTypes).to.contain('did:jwk');
      expect(subjectSyntaxTypes).to.contain('did:key');
      expect(subjectSyntaxTypes).to.contain('did:web');
    });
  });
});

