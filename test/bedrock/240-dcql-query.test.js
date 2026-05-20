/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {getDcqlQuery} from '../../lib/workflows/common/oid4vp.js';

// Local convenience constant for test expectations, avoiding extra test-only
// exports.
const VC_BASE_IRI =
  'https://www.w3.org/2018/credentials#VerifiableCredential';

const LDP_CONTEXT_PATH = ['$[\'@context\']'];
const LDP_TYPE_PATH = ['$.type'];
const JWT_CONTEXT_PATH = ['$.vc[\'@context\']', '$[\'@context\']'];
const JWT_TYPE_PATH = ['$.vc.type', '$.verifiableCredential.type', '$.type'];

const OB3_CONTEXT_URLS = [
  'https://www.w3.org/ns/credentials/v2',
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
];

const MDL_CONTEXT_URLS = [
  'https://www.w3.org/2018/credentials/v1',
  'https://w3id.org/vdl/v1',
  'https://w3id.org/vdl/aamva/v1'
];

describe('DCQL Query Generation', () => {
  describe('Fields Type Handling', () => {
    it('emits base-only type_values + per-value claims for ldp_vc ' +
      'OpenBadge workflow', async () => {
      const workflow = {
        query: [{
          context: OB3_CONTEXT_URLS,
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
      expect(credential.meta.type_values).to.eql([[VC_BASE_IRI]]);

      // Two @context claims (one per URL) + one type claim from fields.type.
      // VerifiableCredential is filtered out of `otherTypes` and is never
      // duplicated as a claim — it lives only in meta.type_values.
      expect(credential).to.have.property('claims');
      expect(credential.claims).to.be.an('array');
      expect(credential.claims.length).to.be(3);

      expect(credential.claims[0]).to.eql({
        path: LDP_CONTEXT_PATH,
        values: [OB3_CONTEXT_URLS[0]]
      });
      expect(credential.claims[1]).to.eql({
        path: LDP_CONTEXT_PATH,
        values: [OB3_CONTEXT_URLS[1]]
      });
      expect(credential.claims[2]).to.eql({
        path: LDP_TYPE_PATH,
        values: ['OpenBadgeCredential']
      });
    });

    it('emits jwt_vc_json paths for OpenBadge workflow', async () => {
      const workflow = {
        query: [{
          context: OB3_CONTEXT_URLS,
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

      expect(result.dcql_query.credentials.length).to.be(1);

      const credential = result.dcql_query.credentials[0];
      expect(credential.format).to.be('jwt_vc_json');
      expect(credential.meta.type_values).to.eql([[VC_BASE_IRI]]);

      expect(credential.claims.length).to.be(3);
      expect(credential.claims[0]).to.eql({
        path: JWT_CONTEXT_PATH,
        values: [OB3_CONTEXT_URLS[0]]
      });
      expect(credential.claims[1]).to.eql({
        path: JWT_CONTEXT_PATH,
        values: [OB3_CONTEXT_URLS[1]]
      });
      expect(credential.claims[2]).to.eql({
        path: JWT_TYPE_PATH,
        values: ['OpenBadgeCredential']
      });
    });

    it('emits one claim per fields.type value (no combined values)',
      async () => {
        const workflow = {
          query: [{
            context: OB3_CONTEXT_URLS,
            type: ['VerifiableCredential'],
            fields: {
              type: ['OpenBadgeCredential', 'EndorsementCredential']
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

        expect(credential.meta.type_values).to.eql([[VC_BASE_IRI]]);

        // 2 context claims + 2 fields.type claims (one per value, each with
        // a single-value `values` array — no combined `[a, b]`).
        expect(credential.claims.length).to.be(4);

        const typeClaims = credential.claims.filter(
          c => c.path[0] === '$.type');
        expect(typeClaims.length).to.be(2);
        expect(typeClaims[0]).to.eql({
          path: LDP_TYPE_PATH,
          values: ['OpenBadgeCredential']
        });
        expect(typeClaims[1]).to.eql({
          path: LDP_TYPE_PATH,
          values: ['EndorsementCredential']
        });
      });

    it('emits base-only type_values + no claims for type-only query item ' +
      '(no context, no fields)', async () => {
      const workflow = {
        query: [{
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

      expect(credential.format).to.be('ldp_vc');
      expect(credential.meta.type_values).to.eql([[VC_BASE_IRI]]);
      expect(credential).to.not.have.property('claims');
    });

    it('emits Iso18013DriversLicenseCredential workflow shape (jwt_vc_json, ' +
      'three-URL context, no VerifiableCredential in type)', async () => {
      const workflow = {
        query: [{
          context: MDL_CONTEXT_URLS,
          type: ['Iso18013DriversLicenseCredential'],
          format: ['jwt_vc_json']
        }]
      };

      const result = await getDcqlQuery({
        workflow,
        profile: 'OID4VP-1.0'
      });

      expect(result.dcql_query.credentials.length).to.be(1);
      const credential = result.dcql_query.credentials[0];

      expect(credential.format).to.be('jwt_vc_json');
      expect(credential.meta.type_values).to.eql([[VC_BASE_IRI]]);

      // 3 context claims (one per URL) + 1 type claim
      // (Iso18013DriversLicenseCredential). No `VerifiableCredential` claim
      // because the base type lives only in meta.type_values.
      expect(credential.claims.length).to.be(4);
      expect(credential.claims[0]).to.eql({
        path: JWT_CONTEXT_PATH,
        values: [MDL_CONTEXT_URLS[0]]
      });
      expect(credential.claims[1]).to.eql({
        path: JWT_CONTEXT_PATH,
        values: [MDL_CONTEXT_URLS[1]]
      });
      expect(credential.claims[2]).to.eql({
        path: JWT_CONTEXT_PATH,
        values: [MDL_CONTEXT_URLS[2]]
      });
      expect(credential.claims[3]).to.eql({
        path: JWT_TYPE_PATH,
        values: ['Iso18013DriversLicenseCredential']
      });
    });

    it('does not duplicate VerifiableCredential as a type claim when listed ' +
      'alongside a non-base type', async () => {
      const workflow = {
        query: [{
          context: OB3_CONTEXT_URLS,
          type: ['VerifiableCredential', 'OpenBadgeCredential'],
          format: ['ldp_vc']
        }]
      };

      const result = await getDcqlQuery({
        workflow,
        profile: 'OID4VP-1.0'
      });

      expect(result.dcql_query.credentials.length).to.be(1);
      const credential = result.dcql_query.credentials[0];

      expect(credential.meta.type_values).to.eql([[VC_BASE_IRI]]);

      const typeClaims = credential.claims.filter(
        c => c.path[0] === '$.type');
      expect(typeClaims.length).to.be(1);
      expect(typeClaims[0]).to.eql({
        path: LDP_TYPE_PATH,
        values: ['OpenBadgeCredential']
      });

      // No claim should carry `VerifiableCredential` as a value.
      const hasBaseTypeClaim = credential.claims.some(
        c => c.values.includes('VerifiableCredential'));
      expect(hasBaseTypeClaim).to.be(false);
    });

    it('emits one credential per query item, format-specific paths intact',
      async () => {
        const workflow = {
          query: [
            {
              context: OB3_CONTEXT_URLS,
              type: ['VerifiableCredential'],
              fields: {
                type: ['OpenBadgeCredential']
              },
              format: ['ldp_vc']
            },
            {
              context: OB3_CONTEXT_URLS,
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

        const ldpCred = result.dcql_query.credentials[0];
        expect(ldpCred.format).to.be('ldp_vc');
        expect(ldpCred.meta.type_values).to.eql([[VC_BASE_IRI]]);
        const ldpTypeClaim = ldpCred.claims.find(
          c => c.path[0] === '$.type');
        expect(ldpTypeClaim).to.eql({
          path: LDP_TYPE_PATH,
          values: ['OpenBadgeCredential']
        });

        const jwtCred = result.dcql_query.credentials[1];
        expect(jwtCred.format).to.be('jwt_vc_json');
        expect(jwtCred.meta.type_values).to.eql([[VC_BASE_IRI]]);
        const jwtTypeClaim = jwtCred.claims.find(
          c => c.path[0] === '$.vc.type');
        expect(jwtTypeClaim).to.eql({
          path: JWT_TYPE_PATH,
          values: ['AchievementCredential']
        });
      });

    it('passes mso_mdoc query items through unchanged', async () => {
      const workflow = {
        query: [{
          fields: {
            'org.iso.18013.5.1': ['family_name', 'given_name']
          },
          format: ['mso_mdoc']
        }]
      };

      const result = await getDcqlQuery({
        workflow,
        profile: 'OID4VP-1.0'
      });

      expect(result.dcql_query.credentials.length).to.be(1);
      const credential = result.dcql_query.credentials[0];

      expect(credential.format).to.be('mso_mdoc');
      expect(credential.meta).to.eql({
        doctype_value: 'org.iso.18013.5.1.mDL'
      });
      expect(credential.claims).to.eql([
        {intent_to_retain: true, path: ['org.iso.18013.5.1', 'family_name']},
        {intent_to_retain: true, path: ['org.iso.18013.5.1', 'given_name']}
      ]);
    });

    it('returns dcql_query override verbatim when present on workflow',
      async () => {
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

    it('returns empty object for OID4VP-draft18 profile', async () => {
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

    it('emits base-only type_values + no claims for an empty query item',
      async () => {
        const workflow = {
          query: [{
            format: ['ldp_vc']
          }]
        };

        const result = await getDcqlQuery({
          workflow,
          profile: 'OID4VP-1.0'
        });

        expect(result.dcql_query.credentials.length).to.be(1);
        const credential = result.dcql_query.credentials[0];

        expect(credential.format).to.be('ldp_vc');
        expect(credential.meta.type_values).to.eql([[VC_BASE_IRI]]);
        expect(credential).to.not.have.property('claims');
      });
  });
});
