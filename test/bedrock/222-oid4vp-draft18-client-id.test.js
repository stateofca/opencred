/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';
import {domainToDidWeb} from '../../lib/didWeb.js';
import expect from 'expect.js';
import {
  generateAuthorizationRequest
} from '../../lib/workflows/profiles/native-oid4vp-standard.js';

// Test workflow with mixed formats (jwt_vc_json and mso_mdoc)
const testWorkflow = {
  type: 'native',
  clientId: 'test-oid4vp-draft18',
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

describe('OID4VP-draft18 Client ID Format', function() {
  describe('generateAuthorizationRequest', function() {
    const mockExchange = {
      id: 'test-exchange',
      challenge: 'test-challenge-123',
      state: 'pending',
      variables: {}
    };

    const mockRequestUrl = '/workflows/test/exchanges/123/openid/' +
      'client/authorization/request';

    it('should use OID4VP-draft18 format (client_id_scheme + bare DID)',
      async function() {
        const result = await generateAuthorizationRequest({
          workflow: testWorkflow,
          exchange: mockExchange,
          requestUrl: mockRequestUrl,
          profile: 'OID4VP-draft18',
          responseMode: 'dc_api',
          clientIdScheme: 'did'
        });

        expect(result.authorizationRequest.client_id_scheme).to.equal('did');
        expect(result.authorizationRequest.client_id).to.equal(
          domainToDidWeb(config.server.baseUri)
        );
        expect(result.signingMetadata).to.be(undefined);
      });
  });
});
