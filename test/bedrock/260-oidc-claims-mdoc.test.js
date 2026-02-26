/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {importSPKI, jwtVerify} from 'jose';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';

import {baseUrl} from '../mock-data.js';
import {config} from '@bedrock/core';
import {database} from '../../lib/database.js';
import {exampleKey} from '../fixtures/signingKeys.js';
import expect from 'expect.js';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

const mdocWorkflowWithClaims = {
  type: 'native',
  clientId: 'mdoc-oidc-claims',
  clientSecret: 'shhh',
  query: [{
    format: ['mso_mdoc'],
    fields: {
      'org.iso.18013.5.1': ['given_name', 'family_name']
    }
  }],
  oidc: {
    redirectUri: 'https://example.com',
    claims: [
      {
        name: 'given_name',
        path: 'org.iso.18013.5.1.given_name',
        format: 'mso_mdoc'
      },
      {
        name: 'family_name',
        path: 'org.iso.18013.5.1.family_name',
        format: 'mso_mdoc'
      }
    ]
  }
};

const hybridWorkflowWithClaims = {
  type: 'native',
  clientId: 'hybrid-oidc-claims',
  clientSecret: 'shhh',
  query: [
    {
      format: ['mso_mdoc'],
      fields: {
        'org.iso.18013.5.1': ['given_name', 'family_name']
      }
    },
    {
      format: ['ldp_vc'],
      type: ['VerifiableCredential']
    }
  ],
  oidc: {
    redirectUri: 'https://example.com',
    claims: [
      {
        name: 'email',
        path: 'userEmail',
        format: 'ldp_vc'
      },
      {
        name: 'given_name',
        path: 'org.iso.18013.5.1.given_name',
        format: 'mso_mdoc'
      },
      {
        name: 'family_name',
        path: 'org.iso.18013.5.1.family_name',
        format: 'mso_mdoc'
      }
    ]
  }
};

function createMockExchange(workflowId, credentials) {
  return {
    _id: 'test',
    id: 'test-exchange',
    ttl: 900,
    workflowId,
    state: 'complete',
    step: 'default',
    oidc: {code: 'the-code', state: 'test'},
    variables: {
      results: {
        default: {
          verifiablePresentation: {
            type: 'VerifiablePresentation',
            verifiableCredential: credentials
          }
        }
      }
    }
  };
}

describe('OIDC id_token Claims - mdoc and Hybrid', function() {
  let workflowStub;
  let findOneStub;
  let updateOneStub;
  let signingKeysStub;

  afterEach(function() {
    if(workflowStub) {
      workflowStub.restore();
    }
    if(findOneStub) {
      findOneStub.restore();
    }
    if(updateOneStub) {
      updateOneStub.restore();
    }
    if(signingKeysStub) {
      signingKeysStub.restore();
    }
  });

  it('should return id_token with mdoc claims when mdoc-only workflow',
    async function() {
      const mdocCredential = {
        id: 'data:application/mdl;base64,abc123',
        type: 'EnvelopedVerifiableCredential',
        credentialSubject: {
          id: 'data:application/mdl;base64,abc123',
          'org.iso.18013.5.1.given_name': 'Jane',
          'org.iso.18013.5.1.family_name': 'Smith'
        }
      };

      const exchange = createMockExchange(
        mdocWorkflowWithClaims.clientId,
        [mdocCredential]
      );

      workflowStub = sinon.stub(config.opencred, 'workflows').value(
        [mdocWorkflowWithClaims]
      );
      findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(exchange);
      updateOneStub = sinon.stub(
        database.collections.Exchanges, 'updateOne'
      ).resolves();
      signingKeysStub = sinon.stub(config.opencred, 'signingKeys').value([
        exampleKey
      ]);

      const result = await client.post(`${baseUrl}/token`, {
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: 'client_id=mdoc-oidc-claims&client_secret=shhh' +
          '&grant_type=authorization_code&code=the-code' +
          '&redirect_uri=https%3A%2F%2Fexample.com&scope=openid'
      });

      expect(result.status).to.equal(200);
      expect(result.data.id_token).to.be.a('string');

      const key = await importSPKI(
        exampleKey.publicKeyPem,
        exampleKey.type
      );
      const {payload} = await jwtVerify(result.data.id_token, key);

      expect(payload.sub).to.equal('data:application/mdl;base64,abc123');
      expect(payload.given_name).to.equal('Jane');
      expect(payload.family_name).to.equal('Smith');
    });

  it('should return id_token with format-specific claims in hybrid flow',
    async function() {
      const vcCredential = {
        id: 'did:example:vc-123',
        type: 'VerifiableCredential',
        credentialSubject: {
          id: 'did:example:vc-123',
          userEmail: 'alice@example.com'
        }
      };

      const mdocCredential = {
        id: 'data:application/mdl;base64,xyz789',
        type: 'EnvelopedVerifiableCredential',
        credentialSubject: {
          id: 'data:application/mdl;base64,xyz789',
          'org.iso.18013.5.1.given_name': 'Alice',
          'org.iso.18013.5.1.family_name': 'Johnson'
        }
      };

      const exchange = createMockExchange(
        hybridWorkflowWithClaims.clientId,
        [vcCredential, mdocCredential]
      );

      workflowStub = sinon.stub(config.opencred, 'workflows').value(
        [hybridWorkflowWithClaims]
      );
      findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(exchange);
      updateOneStub = sinon.stub(
        database.collections.Exchanges, 'updateOne'
      ).resolves();
      signingKeysStub = sinon.stub(config.opencred, 'signingKeys').value([
        exampleKey
      ]);

      const result = await client.post(`${baseUrl}/token`, {
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: 'client_id=hybrid-oidc-claims&client_secret=shhh' +
          '&grant_type=authorization_code&code=the-code' +
          '&redirect_uri=https%3A%2F%2Fexample.com&scope=openid'
      });

      expect(result.status).to.equal(200);
      expect(result.data.id_token).to.be.a('string');

      const key = await importSPKI(
        exampleKey.publicKeyPem,
        exampleKey.type
      );
      const {payload} = await jwtVerify(result.data.id_token, key);

      expect(payload.sub).to.equal('did:example:vc-123');
      expect(payload.email).to.equal('alice@example.com');
      expect(payload.given_name).to.equal('Alice');
      expect(payload.family_name).to.equal('Johnson');
    });
});
