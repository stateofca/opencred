/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
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

  describe('Query Format', () => {
    it('should convert query to input_descriptors', async () => {
      const workflow = {
        query: [{
          context: [
            'https://www.w3.org/2018/credentials/v1',
            'https://w3id.org/vdl/v1'
          ],
          type: ['Iso18013DriversLicenseCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      expect(result[0]).to.have.property('id');
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

      // Check that type field was created
      const typeField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('type')) :
          f.path.includes('type')));
      expect(typeField).to.be.ok();
      expect(typeField.filter.type).to.be('array');
      expect(typeField.filter.allOf).to.be.an('array');
      expect(typeField.filter.allOf.length).to.be(1);
      // Check that each allOf entry has contains structure
      expect(typeField.filter.allOf[0]).to.have.property('contains');
    });

    it('should convert query with LDP format', async () => {
      const workflow = {
        query: [{
          context: ['https://example.org/v1'],
          type: ['TestCredential'],
          format: ['ldp_vc']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      expect(result[0].id).to.be.a('string');
      expect(result[0].id.length).to.be.greaterThan(0);
      expect(result[0].constraints.fields).to.be.an('array');
    });

    it('should handle multiple queries in array', async () => {
      const workflow = {
        query: [
          {
            type: ['Type1'],
            format: ['jwt_vc_json']
          },
          {
            type: ['Type2'],
            format: ['ldp_vc']
          }
        ]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(2);
      expect(result[0].id).to.be.a('string');
      expect(result[1].id).to.be.a('string');
    });

    it('should include purpose when description is provided', async () => {
      const workflow = {
        query: [{
          type: ['TestCredential'],
          format: ['jwt_vc_json']
        }],
        description: 'Please present your VC.'
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      expect(result[0]).to.have.property('purpose', 'Please present your VC.');
    });

    it('should not include purpose field when description is not provided',
      async () => {
        const workflow = {
          query: [{
            type: ['TestCredential'],
            format: ['jwt_vc_json']
          }]
        };

        const result = await getInputDescriptors({
          workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
        });

        expect(result).to.be.an('array');
        expect(result.length).to.be(1);
        expect(result[0]).to.not.have.property('purpose');
      });
  });

  describe('Query Format', () => {
    it('should convert query to input_descriptors', async () => {
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

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      expect(result[0]).to.have.property('id');
      expect(result[0]).to.have.property('format');
      expect(result[0]).to.have.property('purpose', 'Test description');
      expect(result[0]).to.have.property('constraints');
      expect(result[0].constraints.fields).to.be.an('array');
      // Should have both type and context fields
      expect(result[0].constraints.fields.length).to.be(2);
      const typeField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('type')) :
          f.path.includes('type')));
      expect(typeField).to.be.ok();
      expect(typeField.filter.allOf[0].contains.const)
        .to.be('Iso18013DriversLicenseCredential');
    });

    it('should handle multiple types in array', async () => {
      const workflow = {
        query: [{
          type: ['Type1', 'Type2', 'Type3']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      const typeField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('type')) :
          f.path.includes('type')));
      expect(typeField).to.be.ok();
      expect(typeField.filter.allOf).to.be.an('array');
      expect(typeField.filter.allOf.length).to.be(3);
      expect(typeField.filter.allOf[0].contains.const).to.be('Type1');
      expect(typeField.filter.allOf[1].contains.const).to.be('Type2');
      expect(typeField.filter.allOf[2].contains.const).to.be('Type3');
    });

    it('should create context field constraint', async () => {
      const workflow = {
        query: [{
          context: [
            'https://www.w3.org/2018/credentials/v1',
            'https://w3id.org/vdl/v1'
          ]
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      const contextField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('@context')) :
          f.path.includes('@context')));
      expect(contextField).to.be.ok();
      expect(contextField.filter.allOf).to.be.an('array');
      expect(contextField.filter.allOf.length).to.be(2);
      expect(contextField.filter.allOf[0].contains.const)
        .to.be('https://www.w3.org/2018/credentials/v1');
      expect(contextField.filter.allOf[1].contains.const)
        .to.be('https://w3id.org/vdl/v1');
    });

    it('should handle context field paths for jwt_vc_json format', async () => {
      const workflow = {
        query: [{
          context: ['https://example.org/v1'],
          format: ['jwt_vc_json']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result[0].constraints.fields).to.be.an('array');
      const contextField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('@context')) :
          f.path.includes('@context')));
      expect(contextField).to.be.ok();
      expect(contextField.path).to.be.an('array');
      // Should have both paths for JWT format
      expect(contextField.path.length).to.be(2);
      expect(contextField.path.some(p => p.includes('@context'))).to.be(true);
    });

    it('should handle context field paths for ldp_vc format', async () => {
      const workflow = {
        query: [{
          context: ['https://example.org/v1'],
          format: ['ldp_vc']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result[0].constraints.fields).to.be.an('array');
      const contextField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('@context')) :
          f.path.includes('@context')));
      expect(contextField).to.be.ok();
      expect(contextField.path).to.be.an('array');
      // Should have single path for LDP format
      expect(contextField.path.length).to.be(1);
      expect(contextField.path[0]).to.contain('@context');
    });

    it('should create field constraints from query.fields', async () => {
      const workflow = {
        query: [{
          type: ['TestCredential'],
          fields: {
            givenName: ['John'],
            familyName: ['Doe']
          }
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      // Should have type field plus 2 fields from query.fields
      expect(result[0].constraints.fields.length).to.be(3);
      const givenNameField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('givenName')) :
          f.path.includes('givenName')));
      expect(givenNameField).to.be.ok();
      expect(givenNameField.filter.allOf[0].contains.const).to.be('John');
      const familyNameField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('familyName')) :
          f.path.includes('familyName')));
      expect(familyNameField).to.be.ok();
      expect(familyNameField.filter.allOf[0].contains.const).to.be('Doe');
    });

    it('should handle fields with multiple values', async () => {
      const workflow = {
        query: [{
          fields: {
            role: ['admin', 'user', 'viewer']
          }
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      const roleField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('role')) :
          f.path.includes('role')));
      expect(roleField).to.be.ok();
      expect(roleField.filter.allOf).to.be.an('array');
      expect(roleField.filter.allOf.length).to.be(3);
      expect(roleField.filter.allOf[0].contains.const).to.be('admin');
      expect(roleField.filter.allOf[1].contains.const).to.be('user');
      expect(roleField.filter.allOf[2].contains.const).to.be('viewer');
    });

    it('should filter format based on query.format', async () => {
      const workflow = {
        query: [{
          type: ['TestCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result[0].format).to.have.property('jwt_vc_json');
      expect(result[0].format).to.not.have.property('ldp_vc');
    });

    it('should support multiple formats', async () => {
      const workflow = {
        query: [{
          type: ['TestCredential'],
          format: ['jwt_vc_json', 'ldp_vc']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result[0].format).to.have.property('jwt_vc_json');
      expect(result[0].format).to.have.property('ldp_vc');
    });

    it('should default to ldp_vc format when not specified', async () => {
      const workflow = {
        query: [{
          type: ['TestCredential']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result[0].format).to.have.property('ldp_vc');
      expect(result[0].format).to.not.have.property('jwt_vc_json');
    });

    it('should handle query with all properties', async () => {
      const workflow = {
        query: [{
          type: ['TestCredential'],
          context: ['https://example.org/v1'],
          fields: {
            name: ['Test']
          },
          format: ['ldp_vc']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      // Should have type, context, and name fields
      expect(result[0].constraints.fields.length).to.be(3);
      expect(result[0].format).to.have.property('ldp_vc');
    });

    it('should handle query with only type (backward compatibility)',
      async () => {
        const workflow = {
          query: [{
            type: ['TestCredential']
          }]
        };

        const result = await getInputDescriptors({
          workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
        });

        expect(result).to.be.an('array');
        expect(result.length).to.be(1);
        expect(result[0].constraints.fields.length).to.be(1);
        const typeField = result[0].constraints.fields[0];
        expect(typeField.path).to.be.an('array');
        expect(typeField.path.some(p => p.includes('type'))).to.be(true);
      });

    it('should handle query with type and context', async () => {
      const workflow = {
        query: [{
          type: ['TestCredential'],
          context: ['https://example.org/v1']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result[0].constraints.fields.length).to.be(2);
      const typeField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('type')) :
          f.path.includes('type')));
      expect(typeField).to.be.ok();
      const contextField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('@context')) :
          f.path.includes('@context')));
      expect(contextField).to.be.ok();
    });

    it('should handle query with type and fields', async () => {
      const workflow = {
        query: [{
          type: ['TestCredential'],
          fields: {
            email: ['test@example.com']
          }
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result[0].constraints.fields.length).to.be(2);
      const typeField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('type')) :
          f.path.includes('type')));
      expect(typeField).to.be.ok();
      const emailField = result[0].constraints.fields.find(
        f => f.path && (Array.isArray(f.path) ?
          f.path.some(p => p.includes('email')) :
          f.path.includes('email')));
      expect(emailField).to.be.ok();
    });

    it('should not add type field for empty type array', async () => {
      const workflow = {
        query: [{
          type: []
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result[0].constraints.fields.length).to.be(0);
    });

    it('should not add context field for empty context array', async () => {
      const workflow = {
        query: [{
          context: []
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result[0].constraints.fields.length).to.be(0);
    });

    it('should not add field constraints for empty fields object', async () => {
      const workflow = {
        query: [{
          type: ['TestCredential'],
          fields: {}
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      // Should only have type field
      expect(result[0].constraints.fields.length).to.be(1);
    });

    it('should handle query with no properties gracefully', async () => {
      const workflow = {
        query: [{}]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      expect(result[0].constraints.fields.length).to.be(0);
      // Should still have default format
      expect(result[0].format).to.have.property('ldp_vc');
    });

    it('should handle multiple query objects in array', async () => {
      const workflow = {
        query: [
          {
            type: ['Type1']
          },
          {
            type: ['Type2'],
            context: ['https://example.org/v1']
          }
        ]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(2);
      expect(result[0].constraints.fields.length).to.be(1);
      expect(result[1].constraints.fields.length).to.be(2);
    });

    it('should handle query with mso_mdoc format', async () => {
      const workflow = {
        query: [{
          type: ['TestCredential'],
          format: ['mso_mdoc']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result).to.be.an('array');
      expect(result.length).to.be(1);
      expect(result[0].format).to.have.property('ldp_vc');
      // mso_mdoc uses ldp_vc format object
      expect(result[0].format.ldp_vc).to.be.an('object');
    });

    it('should handle query with mso_mdoc format and dcApiNamespaceQuery',
      async () => {
        const workflow = {
          query: [{
            type: ['TestCredential'],
            format: ['mso_mdoc'],
            dcApiNamespaceQuery: {
              'org.iso.18013.5.1': ['given_name', 'family_name']
            }
          }]
        };

        const result = await getInputDescriptors({
          workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
        });

        expect(result).to.be.an('array');
        expect(result.length).to.be(1);
        expect(result[0].format).to.have.property('ldp_vc');
      });
  });

  describe('Query Format', () => {
    it('should convert query to input_descriptors', async () => {
      const workflow = {
        query: [{
          context: [
            'https://www.w3.org/2018/credentials/v1',
            'https://w3id.org/vdl/v1'
          ],
          type: ['Iso18013DriversLicenseCredential']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
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
      const workflow = {
        query: [{
          type: ['TestCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const result = await getInputDescriptors({
        workflow, exchange: mockExchange, domain: mockDomain, url: mockUrl
      });

      expect(result[0].format).to.have.property('jwt_vc_json');
      // When format is jwt_vc_json only, ldp_vc is not included
      expect(result[0].format).to.not.have.property('ldp_vc');
    });
  });
});

