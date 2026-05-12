/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';

import {baseUrl} from '../mock-data.js';
import {config} from '@bedrock/core';
import {createExchangeWithAuthRequest} from '../utils/exchanges.js';
import {database} from '../../lib/database.js';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

const standardWorkflow = {
  type: 'native',
  clientId: 'standard-client',
  clientSecret: 'standard-secret',
  query: [{
    context: [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/vdl/v1',
      'https://w3id.org/vdl/aamva/v1'
    ],
    type: ['Iso18013DriversLicense']
  }]
};

const legacyWorkflow = {
  type: 'native',
  clientId: 'new-client-id',
  clientSecret: 'legacy-secret',
  workflowId: 'old-slug',
  query: [{
    context: [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/vdl/v1',
      'https://w3id.org/vdl/aamva/v1'
    ],
    type: ['Iso18013DriversLicense']
  }]
};

describe('Legacy workflowId fallback', function() {
  this.beforeEach(function() {
    this.rpStub = sinon.stub(config.opencred, 'workflows').value(
      [standardWorkflow, legacyWorkflow]);
  });

  this.afterEach(function() {
    this.rpStub.restore();
  });

  describe('POST /workflows/:workflowId/exchanges', function() {
    it('should create exchange using clientId in path', async function() {
      const exchange = await createExchangeWithAuthRequest({
        workflow: legacyWorkflow});
      const insertStub = sinon.stub(
        database.collections.Exchanges, 'insertOne')
        .resolves(exchange);
      const basic = Buffer.from(
        'new-client-id:legacy-secret').toString('base64');
      let result;
      let err;
      try {
        result = await client
          .post(`${baseUrl}/workflows/new-client-id/exchanges`, {
            headers: {Authorization: `Basic ${basic}`}
          });
      } catch(e) {
        err = e;
      }
      insertStub.restore();

      should.not.exist(err);
      result.status.should.equal(200);
      result.data.id.should.be.a('string');
      result.data.workflowId.should.be.a('string');
    });

    it('should create exchange using legacy workflowId in path',
      async function() {
        const exchange = await createExchangeWithAuthRequest({
          workflow: legacyWorkflow});
        const insertStub = sinon.stub(
          database.collections.Exchanges, 'insertOne')
          .resolves(exchange);
        // URL path uses workflowId; Basic auth uses canonical clientId
        const basic = Buffer.from(
          'new-client-id:legacy-secret').toString('base64');
        let result;
        let err;
        try {
          result = await client
            .post(`${baseUrl}/workflows/old-slug/exchanges`, {
              headers: {Authorization: `Basic ${basic}`}
            });
        } catch(e) {
          err = e;
        }
        insertStub.restore();

        should.not.exist(err);
        result.status.should.equal(200);
        result.data.id.should.be.a('string');
        result.data.workflowId.should.be.a('string');
      });

    it('should 404 for unknown identifier in path', async function() {
      let err;
      let result;
      try {
        result = await client
          .post(`${baseUrl}/workflows/nonexistent/exchanges`);
      } catch(e) {
        err = e;
      }

      should.not.exist(result);
      err.status.should.equal(404);
      err.data.message.should.equal('Unknown workflow id');
    });
  });

  describe('GET /workflows/:workflowId/exchanges/:exchangeId', function() {
    it('should get exchange using legacy workflowId in path',
      async function() {
        const exchange = await createExchangeWithAuthRequest({
          workflow: legacyWorkflow});
        const findStub = sinon.stub(
          database.collections.Exchanges, 'findOne')
          .resolves(exchange);
        let result;
        let err;
        try {
          result = await client
            .get(
              `${baseUrl}/workflows/old-slug/exchanges/${exchange.id}`, {
                headers: {Authorization: `Bearer ${exchange.accessToken}`}
              });
        } catch(e) {
          err = e;
        }
        findStub.restore();

        should.not.exist(err);
        result.status.should.equal(200);
        result.data.exchange.id.should.equal(exchange.id);
      });
  });

  describe('Basic auth with workflowId as username', function() {
    it('should authenticate using workflowId as Basic auth username',
      async function() {
        const basic = Buffer.from(
          'old-slug:legacy-secret').toString('base64');
        let result;
        let err;
        try {
          result = await client
            .post(`${baseUrl}/workflows/old-slug/exchanges`, {
              headers: {Authorization: `Basic ${basic}`}
            });
        } catch(e) {
          err = e;
        }

        should.not.exist(err);
        result.status.should.equal(200);
        result.data.should.have.property('id');
      });

    it('should reject wrong secret with workflowId username',
      async function() {
        const basic = Buffer.from(
          'old-slug:wrong-secret').toString('base64');
        let result;
        let err;
        try {
          result = await client
            .post(`${baseUrl}/workflows/old-slug/exchanges`, {
              headers: {Authorization: `Basic ${basic}`}
            });
        } catch(e) {
          err = e;
        }

        should.not.exist(result);
        err.status.should.equal(401);
      });
  });

  describe('clientId takes precedence over workflowId', function() {
    it('should resolve to clientId match when both could match',
      async function() {
        const collisionWorkflowA = {
          type: 'native',
          clientId: 'collision-id',
          clientSecret: 'secret-a',
          query: [{
            context: [
              'https://www.w3.org/2018/credentials/v1',
              'https://w3id.org/vdl/v1',
              'https://w3id.org/vdl/aamva/v1'
            ],
            type: ['Iso18013DriversLicense']
          }]
        };
        const collisionWorkflowB = {
          type: 'native',
          clientId: 'other-client',
          clientSecret: 'secret-b',
          workflowId: 'collision-id',
          query: [{
            context: [
              'https://www.w3.org/2018/credentials/v1',
              'https://w3id.org/vdl/v1',
              'https://w3id.org/vdl/aamva/v1'
            ],
            type: ['Iso18013DriversLicense']
          }]
        };
        this.rpStub.restore();
        this.rpStub = sinon.stub(config.opencred, 'workflows').value(
          [collisionWorkflowA, collisionWorkflowB]);

        const exchange = await createExchangeWithAuthRequest({
          workflow: collisionWorkflowA});
        const insertStub = sinon.stub(
          database.collections.Exchanges, 'insertOne')
          .resolves(exchange);
        const basic = Buffer.from(
          'collision-id:secret-a').toString('base64');
        let result;
        let err;
        try {
          result = await client
            .post(`${baseUrl}/workflows/collision-id/exchanges`, {
              headers: {Authorization: `Basic ${basic}`}
            });
        } catch(e) {
          err = e;
        }
        insertStub.restore();

        should.not.exist(err);
        result.status.should.equal(200);
        result.data.workflowId.should.equal('collision-id');
      });
  });

  describe('Workflow without workflowId', function() {
    it('should work normally with clientId only', async function() {
      const exchange = await createExchangeWithAuthRequest({
        workflow: standardWorkflow});
      const insertStub = sinon.stub(
        database.collections.Exchanges, 'insertOne')
        .resolves(exchange);
      const basic = Buffer.from(
        'standard-client:standard-secret').toString('base64');
      let result;
      let err;
      try {
        result = await client
          .post(`${baseUrl}/workflows/standard-client/exchanges`, {
            headers: {Authorization: `Basic ${basic}`}
          });
      } catch(e) {
        err = e;
      }
      insertStub.restore();

      should.not.exist(err);
      result.status.should.equal(200);
      result.data.id.should.be.a('string');
    });
  });
});
