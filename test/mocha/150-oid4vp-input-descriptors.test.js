/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {getInputDescriptors} from '../../common/oid4vp.js';

describe('OID4VP Input Descriptors', () => {
  const mockExchange = {
    challenge: 'test-challenge-123'
  };

  const mockDomain = 'https://example.com';
  const mockUrl = '/workflows/test/exchanges/123/openid/client/' +
  'authorization/request';

  describe('DCQL Query Format', () => {
    it('should convert dcql_query to input_descriptors', async () => {
      const rp = {
        dcql_query: {
          credentials: [
            {
              id: 'Iso18013DriversLicenseCredential',
              format: 'jwt_vc_json',
              multiple: false,
              require_cryptographic_holder_binding: true,
              claims: [
                {
                  id: 'c:VCDM1.1',
                  path: ['$.vc.context'],
                  values: [
                    'https://www.w3.org/2018/credentials/v1'
                  ]
                },
                {
                  id: 'c:VDL1',
                  path: ['$.vc.context'],
                  values: [
                    'https://w3id.org/vdl/v1'
                  ]
                }
              ],
              meta: {
                type_values: [
                  [
                    'https://www.w3.org/2018/credentials#VerifiableCredential',
                    'https://w3id.org/vdl#Iso18013DriversLicenseCredential'
                  ]
                ]
              }
            }
          ]
        }
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      expect(result[0]).to.have.property(
        'id', 'Iso18013DriversLicenseCredential');
      expect(result[0]).to.have.property('format');
      expect(result[0]).to.have.property('constraints');
      expect(result[0].constraints).to.have.property('fields');
      expect(result[0].constraints.fields).to.be.an('array');
      expect(result[0].constraints.fields.length).to.be.greaterThan(0);

      // Check that context field was created
      const contextField = result[0].constraints.fields.find(
        f => f.path.includes('$[\'@context\']'));
      expect(contextField).to.be.ok();
      expect(contextField.filter.type).to.be('array');
      expect(contextField.filter.allOf).to.be.an('array');
      expect(contextField.filter.allOf.length).to.be(2);
      // Check that each allOf entry has contains structure
      expect(contextField.filter.allOf[0]).to.have.property('contains');
      expect(contextField.filter.allOf[1]).to.have.property('contains');

      // Check that type field was created from meta.type_values
      const typeField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('type')) :
          f.path.includes('type')));
      expect(typeField).to.be.ok();
      expect(typeField.filter.type).to.be('array');
      expect(typeField.filter.allOf).to.be.an('array');
      expect(typeField.filter.allOf.length).to.be(2);
      // Check that each allOf entry has contains structure
      expect(typeField.filter.allOf[0]).to.have.property('contains');
      expect(typeField.filter.allOf[1]).to.have.property('contains');
    });

    it('should convert dcql_query with LDP format', async () => {
      const rp = {
        dcql_query: {
          credentials: [
            {
              id: 'test-ldp-credential',
              format: 'ldp_vc',
              claims: [
                {
                  id: 'c:type1',
                  path: ['$.type'],
                  values: ['TestCredential']
                }
              ],
              meta: {
                type_values: [
                  ['https://example.org#TestCredential']
                ]
              }
            }
          ]
        }
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      expect(result[0].id).to.be('test-ldp-credential');
      expect(result[0].constraints.fields).to.be.an('array');
    });

    it('should handle multiple credentials in dcql_query', async () => {
      const rp = {
        dcql_query: {
          credentials: [
            {
              id: 'credential-1',
              format: 'jwt_vc_json',
              claims: [
                {
                  path: ['$.vc.context'],
                  values: ['https://example.org/v1']
                }
              ]
            },
            {
              id: 'credential-2',
              format: 'ldp_vc',
              claims: [
                {
                  path: ['$.type'],
                  values: ['TestType']
                }
              ]
            }
          ]
        }
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(2);
      expect(result[0].id).to.be('credential-1');
      expect(result[1].id).to.be('credential-2');
    });

    it('should combine claims with same path', async () => {
      const rp = {
        dcql_query: {
          credentials: [
            {
              id: 'test-credential',
              format: 'jwt_vc_json',
              claims: [
                {
                  path: ['$.vc.context'],
                  values: ['https://example.org/v1']
                },
                {
                  path: ['$.vc.context'],
                  values: ['https://example.org/v2']
                }
              ]
            }
          ]
        }
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      const contextField = result[0].constraints.fields.find(
        f => f.path.includes('$[\'@context\']'));
      expect(contextField).to.be.ok();
      // Should have both values combined
      expect(contextField.filter.allOf).to.be.an('array');
      expect(contextField.filter.allOf.length).to.be(2);
    });

    it('should handle dcql_query without claims', async () => {
      const rp = {
        dcql_query: {
          credentials: [
            {
              id: 'test-credential',
              format: 'jwt_vc_json',
              meta: {
                type_values: [
                  ['https://example.org#TestCredential']
                ]
              }
            }
          ]
        }
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      // Should still have type field from meta.type_values
      const typeField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('type')) :
          f.path.includes('type')));
      expect(typeField).to.be.ok();
    });

    it('should handle dcql_query without meta.type_values', async () => {
      const rp = {
        dcql_query: {
          credentials: [
            {
              id: 'test-credential',
              format: 'jwt_vc_json',
              claims: [
                {
                  path: ['$.vc.context'],
                  values: ['https://example.org/v1']
                }
              ]
            }
          ]
        }
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      // Should have fields from claims
      expect(result[0].constraints.fields.length).to.be.greaterThan(0);
    });

    it('should return empty array for empty credentials', async () => {
      const rp = {
        dcql_query: {
          credentials: []
        }
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should handle credential without id', async () => {
      const rp = {
        dcql_query: {
          credentials: [
            {
              format: 'jwt_vc_json',
              claims: [
                {
                  path: ['$.vc.context'],
                  values: ['https://example.org/v1']
                }
              ]
            }
          ]
        }
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      // Should have generated an id
      expect(result[0].id).to.be.a('string');
      expect(result[0].id.length).to.be.greaterThan(0);
    });

    it('should include purpose when description is provided', async () => {
      const rp = {
        dcql_query: {
          credentials: [
            {
              id: 'test-credential',
              format: 'jwt_vc_json',
              claims: [
                {
                  path: ['$.vc.context'],
                  values: ['https://example.org/v1']
                }
              ]
            }
          ]
        },
        description: 'Please present your VC.'
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      expect(result[0]).to.have.property('purpose', 'Please present your VC.');
    });

    it('should not include purpose field when description is not provided',
      async () => {
        const rp = {
          dcql_query: {
            credentials: [
              {
                id: 'test-credential',
                format: 'jwt_vc_json',
                claims: [
                  {
                    path: ['$.vc.context'],
                    values: ['https://example.org/v1']
                  }
                ]
              }
            ]
          }
        };

        const result = await getInputDescriptors({
          rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
        });

        expect(result).to.be.an('array');
        expect(result.length).to.be(1);
        expect(result[0]).to.not.have.property('purpose');
      });
  });

  describe('Query Format', () => {
    it('should convert query to input_descriptors', async () => {
      const rp = {
        query: {
          context: [
            'https://www.w3.org/2018/credentials/v1',
            'https://w3id.org/vdl/v1'
          ],
          type: 'Iso18013DriversLicenseCredential'
        },
        description: 'Test description'
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      expect(result[0]).to.have.property('id');
      expect(result[0]).to.have.property('format');
      expect(result[0]).to.have.property('purpose', 'Test description');
      expect(result[0]).to.have.property('constraints');
      expect(result[0].constraints.fields).to.be.an('array');
      expect(result[0].constraints.fields.length).to.be(1);
      expect(result[0].constraints.fields[0].filter.pattern).to.be(
        'Iso18013DriversLicenseCredential');
    });
  });

  describe('VerifiablePresentationRequest Format', () => {
    it('should convert VPR to input_descriptors', async () => {
      const rp = {
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

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
      expect(result[0]).to.have.property('id');
      expect(result[0]).to.have.property('format');
      expect(result[0]).to.have.property('constraints');
    });
  });

  describe('Format Field', () => {
    it('should include supported formats in format field', async () => {
      const rp = {
        dcql_query: {
          credentials: [
            {
              id: 'test-credential',
              format: 'jwt_vc_json',
              claims: [
                {
                  path: ['$.vc.context'],
                  values: ['https://example.org/v1']
                }
              ]
            }
          ]
        }
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result[0].format).to.have.property('jwt_vc_json');
      expect(result[0].format).to.have.property('ldp_vc');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing dcql_query.credentials', async () => {
      const rp = {
        dcql_query: {}
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(0);
    });

    it('should handle claims with invalid structure', async () => {
      const rp = {
        dcql_query: {
          credentials: [
            {
              id: 'test-credential',
              format: 'jwt_vc_json',
              claims: [
                {
                  // Missing path
                  values: ['test']
                },
                {
                  path: ['$.vc.context'],
                  // Missing values
                },
                {
                  // Invalid path (not array)
                  path: '$.vc.context',
                  values: ['test']
                }
              ]
            }
          ]
        }
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      // Should skip invalid claims
      expect(result[0].constraints.fields.length).to.be(0);
    });

    it('should handle type_values with empty arrays', async () => {
      const rp = {
        dcql_query: {
          credentials: [
            {
              id: 'test-credential',
              format: 'jwt_vc_json',
              meta: {
                type_values: []
              }
            }
          ]
        }
      };

      const result = await getInputDescriptors({
        rp, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      // Should not create type field for empty type_values
      const typeField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('type')) :
          f.path.includes('type')));
      expect(typeField).to.be(undefined);
    });
  });
});

