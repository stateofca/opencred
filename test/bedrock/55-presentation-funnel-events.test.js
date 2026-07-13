/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import expect from 'expect.js';

import {config} from '@bedrock/core';
import {database} from '../../lib/database.js';
import {exampleKey2} from '../fixtures/signingKeys.js';
import {logger} from '../../lib/logger.js';
import {NativeWorkflowService} from '../../lib/workflows/native-workflow.js';
import {withStubs} from '../utils/withStubs.js';

const workflow = {
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
  })
};

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(key, value) {
      this.headers[key] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      return this;
    }
  };
}

function findEvent(loggerInfoStub, type) {
  return loggerInfoStub.args.find(
    ([logName, evt]) => logName === 'presentation_event' && evt.type === type
  );
}

function findEventIndex(loggerInfoStub, type) {
  return loggerInfoStub.args.findIndex(
    ([logName, evt]) => logName === 'presentation_event' && evt.type === type
  );
}

describe('Presentation funnel events', () => {
  let service;

  before(() => {
    service = new NativeWorkflowService();
  });

  it('createExchangeMiddleware emits presentation_initiated', async () => {
    let loggerInfoStub;
    await withStubs(
      () => {
        const insertStub = sinon.stub(
          database.collections.Exchanges, 'insertOne')
          .resolves({insertedId: 'test'});
        loggerInfoStub = sinon.stub(logger, 'info');
        return [insertStub, loggerInfoStub];
      },
      async () => {
        const req = {
          workflow,
          query: {},
          body: {},
          headers: {'user-agent': 'test-agent'}
        };
        const res = mockRes();
        const next = sinon.spy();

        await service.createExchangeMiddleware(req, res, next);

        expect(next.called).to.be(true);
        expect(req.exchange).to.be.ok();
        const initiated = findEvent(loggerInfoStub, 'presentation_initiated');
        expect(initiated).to.be.ok();
        expect(initiated[1].clientId).to.equal(workflow.clientId);
        expect(initiated[1].exchangeId).to.equal(req.exchange.id);
      }
    );
  });

  it('authorizationRequestMiddleware emits presentation_request_served ' +
    'on the signed-JWT exit', async () => {
    let loggerInfoStub;
    let exchange;
    await withStubs(
      () => {
        const insertStub = sinon.stub(
          database.collections.Exchanges, 'insertOne')
          .resolves({insertedId: 'test'});
        const replaceStub = sinon.stub(
          database.collections.Exchanges, 'replaceOne')
          .resolves();
        const signingKeysStub = sinon.stub(config.opencred, 'signingKeys')
          .value([{...exampleKey2, purpose: ['authorization_request']}]);
        loggerInfoStub = sinon.stub(logger, 'info');
        return [insertStub, replaceStub, signingKeysStub, loggerInfoStub];
      },
      async () => {
        exchange = await service.initExchange(
          {workflow, accessToken: 'token', oidc: {code: null, state: 'test'}},
          {}
        );
        const req = {
          workflow,
          exchange,
          method: 'GET',
          query: {},
          headers: {'user-agent': 'test-agent'},
          originalUrl: `/workflows/${workflow.clientId}/exchanges/` +
            `${exchange.id}/openid/client/authorization/request`
        };
        const res = mockRes();

        await service.authorizationRequestMiddleware(req, res, () => {});

        // signed JAR JWT exit
        if(res.headers['Content-Type'] !==
          'application/oauth-authz-req+jwt') {
          throw new Error(`middleware failed: ${res.statusCode} ${
            JSON.stringify(res.body)}`);
        }
        const served = findEvent(
          loggerInfoStub, 'presentation_request_served');
        expect(served).to.be.ok();
        expect(served[1].clientId).to.equal(workflow.clientId);
        expect(served[1].exchangeId).to.equal(exchange.id);
        expect(served[1].wire).to.equal('jar-jwt');
        expect(served[1].profile).to.be.a('string');
        expect(served[1].responseMode).to.be.a('string');

        // request_served fires after presentation_start
        const startIndex = findEventIndex(
          loggerInfoStub, 'presentation_start');
        const servedIndex = findEventIndex(
          loggerInfoStub, 'presentation_request_served');
        expect(startIndex).to.be.greaterThan(-1);
        expect(servedIndex).to.be.greaterThan(startIndex);
      }
    );
  });

  it('authorizationResponseMiddleware emits presentation_response_received ' +
    'before the terminal event and threads profile into errors', async () => {
    let loggerInfoStub;
    let loggerErrorStub;
    await withStubs(
      () => {
        const replaceStub = sinon.stub(
          database.collections.Exchanges, 'replaceOne')
          .resolves();
        const updateStub = sinon.stub(
          database.collections.Exchanges, 'updateOne')
          .resolves();
        loggerInfoStub = sinon.stub(logger, 'info');
        loggerErrorStub = sinon.stub(logger, 'error');
        return [replaceStub, updateStub, loggerInfoStub, loggerErrorStub];
      },
      async () => {
        const exchange = {
          id: 'test-exchange-id',
          workflowId: workflow.clientId,
          state: 'active',
          step: 'default',
          variables: {profile: 'OID4VP-1.0'}
        };
        const req = {
          workflow,
          exchange,
          body: {},
          headers: {'user-agent': 'test-agent'},
          originalUrl: `/workflows/${workflow.clientId}/exchanges/` +
            `${exchange.id}/openid/client/authorization/response`
        };
        const res = mockRes();

        await service.authorizationResponseMiddleware(req, res, () => {});

        const received = findEvent(
          loggerInfoStub, 'presentation_response_received');
        expect(received).to.be.ok();
        expect(received[1].clientId).to.equal(workflow.clientId);
        expect(received[1].exchangeId).to.equal(exchange.id);

        // an empty response body fails; response_received still fired first
        const receivedIndex = findEventIndex(
          loggerInfoStub, 'presentation_response_received');
        const errorIndex = findEventIndex(
          loggerInfoStub, 'presentation_error');
        expect(errorIndex).to.be.greaterThan(receivedIndex);

        // terminal error carries the resolved profile
        const errorEvent = findEvent(loggerInfoStub, 'presentation_error');
        expect(errorEvent[1].profile).to.equal('OID4VP-1.0');
      }
    );
  });

  it('processCallback threads profile into presentation_success', async () => {
    let loggerInfoStub;
    await withStubs(
      () => {
        const replaceStub = sinon.stub(
          database.collections.Exchanges, 'replaceOne')
          .resolves();
        loggerInfoStub = sinon.stub(logger, 'info');
        return [replaceStub, loggerInfoStub];
      },
      async () => {
        const updatedExchange = {
          id: 'test-exchange-id',
          workflowId: workflow.clientId,
          state: 'complete',
          step: 'default',
          variables: {profile: 'OID4VP-1.0', results: {}}
        };

        // workflow has no callback configured, so sendCallback succeeds
        const result = await service.processCallback({
          workflow,
          updatedExchange,
          userAgent: 'test-agent'
        });

        expect(result.success).to.be(true);
        const success = findEvent(loggerInfoStub, 'presentation_success');
        expect(success).to.be.ok();
        expect(success[1].clientId).to.equal(workflow.clientId);
        expect(success[1].exchangeId).to.equal(updatedExchange.id);
        expect(success[1].profile).to.equal('OID4VP-1.0');
      }
    );
  });
});
