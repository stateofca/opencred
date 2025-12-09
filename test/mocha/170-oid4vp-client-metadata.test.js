/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {getAuthorizationRequest} from '../../common/oid4vp.js';

describe('OID4VP Client Metadata', () => {
  const mockExchange = {
    challenge: 'test-challenge-123'
  };

  const mockDomain = 'https://example.com';
  const mockUrl = '/workflows/test/exchanges/123/openid/client/' +
    'authorization/request';

  describe('vp_formats (Draft 18)', () => {
    it('should include vp_formats with jwt_vp_json and ldp_vp', async () => {
      const rp = {
        query: [{
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const result = await getAuthorizationRequest({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.have.property('client_metadata');
      expect(result.client_metadata).to.have.property('vp_formats');
      expect(result.client_metadata.vp_formats).to.have.property('jwt_vp_json');
      expect(result.client_metadata.vp_formats).to.have.property('ldp_vp');
    });

    it('should have correct structure for jwt_vp_json', async () => {
      const rp = {
        query: [{
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const result = await getAuthorizationRequest({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      const jwtVpJson = result.client_metadata.vp_formats.jwt_vp_json;
      expect(jwtVpJson).to.be.an('object');
      expect(jwtVpJson).to.have.property('alg');
      expect(jwtVpJson.alg).to.be.an('array');
      expect(jwtVpJson.alg).to.contain('ES256');
      expect(jwtVpJson).to.have.property('alg_values');
      expect(jwtVpJson.alg_values).to.be.an('array');
      expect(jwtVpJson.alg_values).to.contain('ES256');
    });

    it('should have correct structure for ldp_vp', async () => {
      const rp = {
        query: [{
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          format: ['ldp_vc']
        }]
      };

      const result = await getAuthorizationRequest({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      const ldpVp = result.client_metadata.vp_formats.ldp_vp;
      expect(ldpVp).to.be.an('object');
      expect(ldpVp).to.have.property('proof_type');
      expect(ldpVp.proof_type).to.be.an('array');
      expect(ldpVp.proof_type).to.contain('ecdsa-rdfc-2019');
    });
  });

  describe('vp_formats_supported (OID4VP 1.0)', () => {
    it('should include vp_formats_supported with jwt_vc_json and ldp_vc keys',
      async () => {
        const rp = {
          query: [{
            context: ['https://www.w3.org/2018/credentials/v1'],
            type: ['VerifiableCredential'],
            format: ['jwt_vc_json']
          }]
        };

        const result = await getAuthorizationRequest({
          rp, exchange: mockExchange, domain: mockDomain, url: mockUrl,
          profile: 'OID4VP-1.0'
        });

        expect(result).to.have.property('client_metadata');
        expect(result.client_metadata).to.have.property('vp_formats_supported');
        expect(result.client_metadata.vp_formats_supported)
          .to.have.property('jwt_vc_json');
        expect(result.client_metadata.vp_formats_supported)
          .to.have.property('ldp_vc');
      });

    it('should have correct 1.0 structure for jwt_vc_json', async () => {
      const rp = {
        query: [{
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const result = await getAuthorizationRequest({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl,
        profile: 'OID4VP-1.0'
      });

      const jwtVcJson = result.client_metadata.vp_formats_supported
        .jwt_vc_json;
      expect(jwtVcJson).to.be.an('object');
      expect(jwtVcJson).to.have.property('alg');
      expect(jwtVcJson.alg).to.be.an('array');
      expect(jwtVcJson.alg).to.contain('ES256');
      expect(jwtVcJson).to.have.property('alg_values');
      expect(jwtVcJson.alg_values).to.be.an('array');
      expect(jwtVcJson.alg_values).to.contain('ES256');
    });

    it('should have correct 1.0 structure for ldp_vc', async () => {
      const rp = {
        query: [{
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          format: ['ldp_vc']
        }]
      };

      const result = await getAuthorizationRequest({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl,
        profile: 'OID4VP-1.0'
      });

      const ldpVc = result.client_metadata.vp_formats_supported.ldp_vc;
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

  describe('Both formats present', () => {
    it('OID4VP-combined: both vp_formats and vp_formats_supported',
      async () => {
        const rp = {
          query: [{
            context: ['https://www.w3.org/2018/credentials/v1'],
            type: ['VerifiableCredential'],
            format: ['jwt_vc_json']
          }]
        };

        const result = await getAuthorizationRequest({
          rp, exchange: mockExchange, domain: mockDomain, url: mockUrl,
          profile: 'OID4VP-combined'
        });

        expect(result.client_metadata).to.have.property('vp_formats');
        expect(result.client_metadata).to.have.property('vp_formats_supported');
      });

    it('OID4VP-combined: different keys in vp_formats vs vp_formats_supported',
      async () => {
        const rp = {
          query: [{
            context: ['https://www.w3.org/2018/credentials/v1'],
            type: ['VerifiableCredential'],
            format: ['jwt_vc_json']
          }]
        };

        const result = await getAuthorizationRequest({
          rp, exchange: mockExchange, domain: mockDomain, url: mockUrl,
          profile: 'OID4VP-combined'
        });

        // Draft 18 should use jwt_vp_json and ldp_vp
        expect(result.client_metadata.vp_formats).to.have.property(
          'jwt_vp_json');
        expect(result.client_metadata.vp_formats).to.have.property('ldp_vp');
        expect(result.client_metadata.vp_formats).to.not.have.property(
          'jwt_vc_json');
        expect(result.client_metadata.vp_formats).to.not.have.property(
          'ldp_vc');

        // OID4VP 1.0 should use jwt_vc_json and ldp_vc
        expect(result.client_metadata.vp_formats_supported)
          .to.have.property('jwt_vc_json');
        expect(result.client_metadata.vp_formats_supported)
          .to.have.property('ldp_vc');
        expect(result.client_metadata.vp_formats_supported)
          .to.not.have.property('jwt_vp_json');
        expect(result.client_metadata.vp_formats_supported)
          .to.not.have.property('ldp_vp');
      });
  });

  describe('Different RP configurations', () => {
    it('OID4VP-combined: both formats with query RP', async () => {
      const rp = {
        query: [{
          type: ['TestCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const result = await getAuthorizationRequest({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl,
        profile: 'OID4VP-combined'
      });

      expect(result.client_metadata).to.have.property('vp_formats');
      expect(result.client_metadata).to.have.property('vp_formats_supported');
    });

    it('OID4VP-combined: both formats with query RP', async () => {
      const rp = {
        query: [{
          context: [
            'https://www.w3.org/2018/credentials/v1',
            'https://w3id.org/vdl/v1'
          ],
          type: ['Iso18013DriversLicenseCredential']
        }],
        description: 'Test description'
      };

      const result = await getAuthorizationRequest({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl,
        profile: 'OID4VP-combined'
      });

      expect(result.client_metadata).to.have.property('vp_formats');
      expect(result.client_metadata).to.have.property('vp_formats_supported');
    });

    it('OID4VP-combined: both formats with verifiablePresentationRequest RP',
      async () => {
        const rp = {
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

        const result = await getAuthorizationRequest({
          rp, exchange: mockExchange, domain: mockDomain, url: mockUrl,
          profile: 'OID4VP-combined'
        });

        expect(result.client_metadata).to.have.property('vp_formats');
        expect(result.client_metadata).to.have.property('vp_formats_supported');
      });
  });

  describe('Client metadata structure', () => {
    it('OID4VP-combined: all required client_metadata fields', async () => {
      const rp = {
        query: [{
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const result = await getAuthorizationRequest({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl,
        profile: 'OID4VP-combined'
      });

      expect(result.client_metadata).to.have.property('client_name');
      expect(result.client_metadata).to.have.property(
        'subject_syntax_types_supported');
      expect(result.client_metadata.subject_syntax_types_supported)
        .to.be.an('array');
      expect(result.client_metadata.subject_syntax_types_supported)
        .to.contain('did:jwk');
      expect(result.client_metadata.subject_syntax_types_supported)
        .to.contain('did:key');
      expect(result.client_metadata.subject_syntax_types_supported)
        .to.contain('did:web');
    });
  });
});

