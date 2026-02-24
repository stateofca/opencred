/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {baseUrl} from '../mock-data.js';
import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {database} from '../../lib/database.js';
import expect from 'expect.js';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

const testRP = {
  type: 'native',
  clientId: 'testworkflow',
  query: [{
    context: [
      'https://www.w3.org/ns/credentials/v2',
      'https://www.w3.org/ns/credentials/examples/v2'
    ],
    type: ['MyPrototypeCredential']
  }],
  verifiablePresentationRequest: JSON.stringify({
    query: {
      type: 'QueryByExample',
      credentialQuery: {
        reason: 'Please present your Driver\'s License',
        example: {
          '@context': [
            'https://www.w3.org/ns/credentials/v2',
            'https://www.w3.org/ns/credentials/examples/v2'
          ],
          type: 'MyPrototypeCredential'
        }
      }
    }
  }),
  clientSecret: 'shhh',
  oidc: {
    redirectUri: 'https://example.com',
    scopes: [{name: 'openid'}]
  }
};

describe('Interactions URL Endpoint', () => {
  let dbStub;

  before(() => {
    dbStub = sinon.stub(database.collections.Exchanges, 'insertOne')
      .resolves({insertedId: 'test'});
  });

  after(() => {
    dbStub.restore();
  });

  describe('GET /interactions/:exchangeId', () => {
    it('should return protocols object for native workflow', async () => {
      const exchange = {
        id: await createId(),
        workflowId: testRP.clientId,
        challenge: await createId(),
        state: 'pending',
        createdAt: new Date(),
        ttl: 900
      };

      const findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(exchange);
      const workflowsStub = sinon.stub(config.opencred, 'workflows')
        .value([testRP]);

      try {
        let result;
        let err;
        try {
          result = await client.get(`${baseUrl}/interactions/${exchange.id}`);
        } catch(e) {
          err = e;
        }

        expect(err).to.be(undefined);
        expect(result).to.not.be(undefined);
        expect(result.status).to.equal(200);
        const protocols = result.data.protocols;
        expect(protocols).to.have.property('vcapi');
        expect(protocols).to.have.property('OID4VP');
        expect(protocols).to.have.property('OID4VP-draft18');
        expect(protocols).to.have.property('OID4VP-1.0');
        expect(protocols).to.have.property('interact');
        expect(protocols.OID4VP).to.contain('profile%3DOID4VP-combined');
        expect(protocols['OID4VP-draft18']).to.contain(
          'profile%3DOID4VP-draft18');
        expect(protocols['OID4VP-1.0']).to.contain(
          'profile%3DOID4VP-1.0');
        expect(protocols.interact).to.contain('iuv=1');
      } finally {
        findOneStub.restore();
        workflowsStub.restore();
      }
    });

    it('should return protocols object for vc-api workflow', async () => {
      const vcApiRP = {
        type: 'vc-api',
        clientId: 'testworkflow-vcapi',
        verifiablePresentationRequest: JSON.stringify({}),
        clientSecret: 'shhh',
        baseUrl: 'https://example.com',
        capability: 'https://example.com/cap'
      };

      const exchange = {
        id: await createId(),
        workflowId: vcApiRP.clientId,
        challenge: await createId(),
        state: 'pending',
        createdAt: new Date(),
        ttl: 900,
        vcapi: 'https://example.com/exchanges/test123'
      };

      const findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(exchange);
      const workflowsStub = sinon.stub(config.opencred, 'workflows')
        .value([vcApiRP]);

      try {
        let result;
        let err;
        try {
          result = await client.get(`${baseUrl}/interactions/${exchange.id}`);
        } catch(e) {
          err = e;
        }

        expect(err).to.be(undefined);
        expect(result).to.not.be(undefined);
        expect(result.status).to.equal(200);
        const protocols = result.data.protocols;
        expect(protocols).to.have.property('vcapi');
        expect(protocols).to.have.property('interact');
        expect(result.data).to.not.have.property('OID4VP');
      } finally {
        findOneStub.restore();
        workflowsStub.restore();
      }
    });

    it('should return protocols object for entra workflow', async () => {
      const entraRP = {
        type: 'microsoft-entra-verified-id',
        clientId: 'testworkflow-entra',
        acceptedCredentialType: 'VerifiedCredentialExpert',
        verifierDid: 'did:example:verifier',
        verifierName: 'Test Verifier',
        apiBaseUrl: 'https://example.com',
        apiLoginBaseUrl: 'https://example.com',
        apiTenantId: 'test-tenant',
        apiClientId: 'test-client',
        apiClientSecret: 'test-secret'
      };

      const exchange = {
        id: await createId(),
        workflowId: entraRP.clientId,
        challenge: await createId(),
        state: 'pending',
        createdAt: new Date(),
        ttl: 900,
        OID4VP: 'openid4vp://?request_uri=test&client_id=did:example:verifier'
      };

      const findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(exchange);
      const workflowsStub = sinon.stub(config.opencred, 'workflows')
        .value([entraRP]);

      try {
        let result;
        let err;
        try {
          result = await client.get(`${baseUrl}/interactions/${exchange.id}`);
        } catch(e) {
          err = e;
        }

        expect(err).to.be(undefined);
        expect(result).to.not.be(undefined);
        expect(result.status).to.equal(200);
        const protocols = result.data.protocols;
        expect(protocols).to.have.property('OID4VP');
        expect(protocols).to.have.property('OID4VP-draft18');
        expect(protocols).to.have.property('interact');
        // Same URL until Entra updates to support 1.0 in some manner.
        expect(protocols.OID4VP).to.equal(protocols['OID4VP-draft18']);
        expect(protocols).to.not.have.property('vcapi');
      } finally {
        findOneStub.restore();
        workflowsStub.restore();
      }
    });

    it('should include interact URL with iuv=1 parameter', async () => {
      const exchange = {
        id: await createId(),
        workflowId: testRP.clientId,
        challenge: await createId(),
        state: 'pending',
        createdAt: new Date(),
        ttl: 900
      };

      const findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(exchange);
      const workflowsStub = sinon.stub(config.opencred, 'workflows')
        .value([testRP]);

      try {
        let result;
        let err;
        try {
          result = await client.get(`${baseUrl}/interactions/${exchange.id}`);
        } catch(e) {
          err = e;
        }

        expect(err).to.be(undefined);
        expect(result).to.not.be(undefined);
        expect(result.status).to.equal(200);
        const protocols = result.data.protocols;
        expect(protocols).to.have.property('interact');
        expect(protocols.interact).to.contain('iuv=1');
        expect(protocols.interact).to.contain(`/interactions/${exchange.id}`);
      } finally {
        findOneStub.restore();
        workflowsStub.restore();
      }
    });
  });

  describe('GET /workflows/:workflowId/exchanges/:exchangeId/protocols', () => {
    it('should return same protocols as /interactions endpoint', async () => {
      // This test verifies the alias endpoint returns the same data
      // In practice, both endpoints use the same middleware
      const exchange = {
        id: await createId(),
        workflowId: testRP.clientId,
        challenge: await createId(),
        state: 'pending',
        createdAt: new Date(),
        ttl: 900
      };

      const findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(exchange);
      const workflowsStub = sinon.stub(config.opencred, 'workflows')
        .value([testRP]);

      try {
        let result;
        let err;
        try {
          result = await client.get(
            `${baseUrl}/workflows/${testRP.clientId}/exchanges/` +
            `${exchange.id}/protocols`
          );
        } catch(e) {
          err = e;
        }

        expect(err).to.be(undefined);
        expect(result).to.not.be(undefined);
        expect(result.status).to.equal(200);
        const protocols = result.data.protocols;
        expect(protocols).to.have.property('vcapi');
        expect(protocols).to.have.property('OID4VP');
        expect(protocols).to.have.property('OID4VP-draft18');
        expect(protocols).to.have.property('OID4VP-1.0');
        expect(protocols).to.have.property('interact');
        expect(protocols.interact).to.contain('iuv=1');
      } finally {
        findOneStub.restore();
        workflowsStub.restore();
      }
    });
  });
});

