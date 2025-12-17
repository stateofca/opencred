/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {getDcqlQuery} from '../../common/oid4vp.js';

describe('DCQL Query Generation', () => {
  describe('Fields Type Handling', () => {
    it('should generate DCQL fields.type for ldp_vc format', async () => {
      const workflow = {
        query: [{
          context: ['https://www.w3.org/ns/credentials/v2'],
          type: ['VerifiableCredential'],
          fields: {
            type: ['OpenBadgeCredential']
          },
          format: ['ldp_vc']
        }]
      };

      const result = await getDcqlQuery({
        workflow,
        profile: 'OID4VP-1.0'
      });

      expect(result).to.have.property('dcql_query');
      expect(result.dcql_query).to.have.property('credentials');
      expect(result.dcql_query.credentials).to.be.an('array');
      expect(result.dcql_query.credentials.length).to.be(1);

      const credential = result.dcql_query.credentials[0];
      expect(credential).to.have.property('id');
      expect(credential.format).to.be('ldp_vc');
      expect(credential).to.have.property('meta');
      expect(credential.meta).to.have.property('type_values');
      expect(credential.meta.type_values).to.be.an('array');
      expect(credential.meta.type_values.length).to.be(1);
      // Base type should be expanded IRI in type_values
      expect(credential.meta.type_values[0]).to.be(
        'https://www.w3.org/2018/credentials#VerifiableCredential');

      // Fields.type should be in claims as expanded IRIs
      expect(credential).to.have.property('claims');
      expect(credential.claims).to.be.an('array');
      expect(credential.claims.length).to.be(1);
      expect(credential.claims[0]).to.have.property('path');
      expect(credential.claims[0].path).to.eql(['$.type']);
      expect(credential.claims[0]).to.have.property('values');
      expect(credential.claims[0].values).to.be.an('array');
      expect(credential.claims[0].values.length).to.be(1);
      // Field type should be expanded IRI
      expect(credential.claims[0].values[0]).to.be(
        'OpenBadgeCredential');
    });

    it('should generate DCQL fields.type for jwt_vc_json format', async () => {
      const workflow = {
        query: [{
          context: ['https://www.w3.org/ns/credentials/v2'],
          type: ['VerifiableCredential'],
          fields: {
            type: ['OpenBadgeCredential']
          },
          format: ['jwt_vc_json']
        }]
      };

      const result = await getDcqlQuery({
        workflow,
        profile: 'OID4VP-1.0'
      });

      expect(result).to.have.property('dcql_query');
      expect(result.dcql_query.credentials.length).to.be(1);

      const credential = result.dcql_query.credentials[0];
      expect(credential.format).to.be('jwt_vc_json');
      expect(credential.meta.type_values).to.be.an('array');
      expect(credential.meta.type_values[0]).to.be(
        'https://www.w3.org/2018/credentials#VerifiableCredential');

      expect(credential).to.have.property('claims');
      expect(credential.claims.length).to.be(1);
      // JWT format should have multiple paths
      expect(credential.claims[0].path).to.eql([
        '$.vc.type',
        '$.verifiableCredential.type',
        '$.type'
      ]);
      expect(credential.claims[0].values[0]).to.be(
        'OpenBadgeCredential');
    });

    it('should handle multiple types in fields.type', async () => {
      const workflow = {
        query: [{
          context: ['https://www.w3.org/ns/credentials/v2'],
          type: ['VerifiableCredential'],
          fields: {
            type: ['OpenBadgeCredential', 'AchievementCredential']
          },
          format: ['ldp_vc']
        }]
      };

      const result = await getDcqlQuery({
        workflow,
        profile: 'OID4VP-1.0'
      });

      expect(result.dcql_query.credentials.length).to.be(1);
      const credential = result.dcql_query.credentials[0];

      // Base type should still be in type_values
      expect(credential.meta.type_values).to.eql([
        'https://www.w3.org/2018/credentials#VerifiableCredential'
      ]);

      // Both field types should be in claims as expanded IRIs
      expect(credential.claims[0].values).to.be.an('array');
      expect(credential.claims[0].values.length).to.be(2);
      expect(credential.claims[0].values).to.contain(
        'OpenBadgeCredential');
      expect(credential.claims[0].values).to.contain(
        'AchievementCredential');
    });

    it('should not include claims when fields.type not present', async () => {
      const workflow = {
        query: [{
          context: ['https://www.w3.org/ns/credentials/v2'],
          type: ['VerifiableCredential'],
          format: ['ldp_vc']
        }]
      };

      const result = await getDcqlQuery({
        workflow,
        profile: 'OID4VP-1.0'
      });

      expect(result.dcql_query.credentials.length).to.be(1);
      const credential = result.dcql_query.credentials[0];

      // Base type should be in type_values
      expect(credential.meta.type_values).to.eql([
        'https://www.w3.org/2018/credentials#VerifiableCredential'
      ]);

      // No claims should be present when fields.type is not specified
      expect(credential).to.not.have.property('claims');
    });

    it('should handle Open Badge workflow configuration', async () => {
      // This matches the configuration in combined.yaml
      const workflow = {
        query: [{
          context: ['https://www.w3.org/ns/credentials/v2'],
          type: ['VerifiableCredential'],
          fields: {
            type: ['OpenBadgeCredential']
          },
          format: ['ldp_vc']
        }]
      };

      const result = await getDcqlQuery({
        workflow,
        profile: 'OID4VP-1.0'
      });

      expect(result.dcql_query.credentials.length).to.be(1);
      const credential = result.dcql_query.credentials[0];

      // Verify structure matches expected DCQL format
      expect(credential).to.have.property('id');
      expect(credential.format).to.be('ldp_vc');
      expect(credential.multiple).to.be(false);
      expect(credential.require_cryptographic_holder_binding).to.be(true);

      // Base VC type in type_values as expanded IRI
      expect(credential.meta.type_values).to.eql([
        'https://www.w3.org/2018/credentials#VerifiableCredential'
      ]);

      // OpenBadgeCredential in claims as expanded IRI
      expect(credential.claims).to.be.an('array');
      expect(credential.claims.length).to.be(1);
      expect(credential.claims[0].path).to.eql(['$.type']);
      expect(credential.claims[0].values).to.eql([
        'OpenBadgeCredential'
      ]);
    });

    it('should handle multiple query items', async () => {
      const workflow = {
        query: [
          {
            context: [
              'https://www.w3.org/ns/credentials/v2',
              'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
            ],
            type: ['VerifiableCredential'],
            fields: {
              type: ['OpenBadgeCredential']
            },
            format: ['ldp_vc']
          },
          {
            context: [
              'https://www.w3.org/ns/credentials/v2',
              'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
            ],
            type: ['VerifiableCredential'],
            fields: {
              type: ['AchievementCredential']
            },
            format: ['jwt_vc_json']
          }
        ]
      };

      const result = await getDcqlQuery({
        workflow,
        profile: 'OID4VP-1.0'
      });

      expect(result.dcql_query.credentials.length).to.be(2);

      // First credential (ldp_vc)
      const ldpCred = result.dcql_query.credentials[0];
      expect(ldpCred.format).to.be('ldp_vc');
      expect(ldpCred.meta.type_values[0]).to.be(
        'https://www.w3.org/2018/credentials#VerifiableCredential');
      expect(ldpCred.claims[0].values[0]).to.be(
        'https://purl.imsglobal.org/spec/vc/ob/vocab.html#OpenBadgeCredential');

      // Second credential (jwt_vc_json)
      const jwtCred = result.dcql_query.credentials[1];
      expect(jwtCred.format).to.be('jwt_vc_json');
      expect(jwtCred.meta.type_values[0]).to.be(
        'https://www.w3.org/2018/credentials#VerifiableCredential');
      expect(jwtCred.claims[0].values[0]).to.be(
        'https://purl.imsglobal.org/spec/vc/ob/vocab.html#OpenBadgeCredential');
    });

    it('should return empty object for OID4VP-draft18 profile', async () => {
      const workflow = {
        query: [{
          context: ['https://www.w3.org/ns/credentials/v2'],
          type: ['VerifiableCredential'],
          fields: {
            type: ['OpenBadgeCredential']
          },
          format: ['ldp_vc']
        }]
      };

      const result = await getDcqlQuery({
        workflow,
        profile: 'OID4VP-draft18'
      });

      expect(result).to.eql({});
    });

    it('should use dcql_query override if present', async () => {
      const dcqlOverride = {
        credentials: [{
          id: 'override-cred',
          format: 'ldp_vc',
          meta: {
            type_values: ['https://example.org/OverrideCredential']
          }
        }]
      };

      const workflow = {
        dcql_query: dcqlOverride,
        query: [{
          context: ['https://www.w3.org/ns/credentials/v2'],
          type: ['VerifiableCredential'],
          fields: {
            type: ['OpenBadgeCredential']
          },
          format: ['ldp_vc']
        }]
      };

      const result = await getDcqlQuery({
        workflow,
        profile: 'OID4VP-1.0'
      });

      expect(result.dcql_query).to.eql(dcqlOverride);
    });
  });
});

