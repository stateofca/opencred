/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import expect from 'expect.js';

import {database} from '../../lib/database.js';
import {dcApiEventMiddleware} from '../../lib/http.js';
import {getAuthFunction} from '../../lib/auth.js';
import {logger} from '../../lib/logger.js';
import {withStubs} from '../utils/withStubs.js';

const workflow = {
  type: 'native',
  clientId: 'testworkflow',
  clientSecret: 'testsecret'
};

const exchange = {
  id: 'test-exchange-id',
  workflowId: workflow.clientId,
  accessToken: 'the-real-token',
  state: 'active'
};

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
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

describe('POST /workflows/:workflowId/exchanges/:exchangeId/dc-api-event',
  () => {
    let loggerInfoStub;

    beforeEach(() => {
      loggerInfoStub = sinon.stub(logger, 'info');
    });

    afterEach(() => {
      loggerInfoStub.restore();
    });

    it('logs presentation_dc_api_cancelled for type "cancelled"', () => {
      const req = {
        workflow,
        exchange,
        body: {type: 'cancelled', profile: 'OID4VP-1.0'},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      dcApiEventMiddleware(req, res);

      const cancelled = findEvent(
        loggerInfoStub, 'presentation_dc_api_cancelled');
      expect(cancelled).to.be.ok();
      expect(cancelled[1].clientId).to.equal(workflow.clientId);
      expect(cancelled[1].exchangeId).to.equal(exchange.id);
      expect(cancelled[1].profile).to.equal('OID4VP-1.0');
      expect(res.statusCode).to.equal(204);
    });

    it('logs presentation_dc_api_error for type "error"', () => {
      const req = {
        workflow,
        exchange,
        body: {type: 'error', profile: 'OID4VP-1.0', errorName: 'AbortError'},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      dcApiEventMiddleware(req, res);

      const errored = findEvent(loggerInfoStub, 'presentation_dc_api_error');
      expect(errored).to.be.ok();
      expect(errored[1].clientId).to.equal(workflow.clientId);
      expect(errored[1].exchangeId).to.equal(exchange.id);
      expect(errored[1].errorName).to.equal('AbortError');
      expect(res.statusCode).to.equal(204);
    });

    it('logs presentation_dc_api_timeout for type "timeout"', () => {
      const req = {
        workflow,
        exchange,
        body: {type: 'timeout', profile: 'OID4VP-1.0', timeoutMs: 30000},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      dcApiEventMiddleware(req, res);

      const timedOut = findEvent(
        loggerInfoStub, 'presentation_dc_api_timeout');
      expect(timedOut).to.be.ok();
      expect(timedOut[1].clientId).to.equal(workflow.clientId);
      expect(timedOut[1].exchangeId).to.equal(exchange.id);
      expect(timedOut[1].timeoutMs).to.equal(30000);
      expect(res.statusCode).to.equal(204);
    });

    it('returns 400 for an unrecognized type', () => {
      const req = {
        workflow,
        exchange,
        body: {type: 'bogus'},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      dcApiEventMiddleware(req, res);

      expect(res.statusCode).to.equal(400);
      expect(loggerInfoStub.called).to.be(false);
    });

    it('does not require exchange state to be pending/active', () => {
      const req = {
        workflow,
        exchange: {...exchange, state: 'complete'},
        body: {type: 'cancelled'},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      dcApiEventMiddleware(req, res);

      expect(res.statusCode).to.equal(204);
      const cancelled = findEvent(
        loggerInfoStub, 'presentation_dc_api_cancelled');
      expect(cancelled).to.be.ok();
    });
  });

describe('dc-api-event route auth (getAuthFunction bearer)', () => {
  const authMiddleware = getAuthFunction(
    {basic: false, bearer: true, body: false});

  function mockRes() {
    return {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(body) {
        this.body = body;
        return this;
      }
    };
  }

  it('rejects a request with no Authorization header', async () => {
    await withStubs(
      () => [],
      async () => {
        const req = {
          workflow,
          params: {exchangeId: exchange.id},
          headers: {}
        };
        const res = mockRes();
        const next = sinon.spy();

        await authMiddleware(req, res, next);

        expect(next.called).to.be(false);
        expect(res.statusCode).to.equal(401);
      }
    );
  });

  it('rejects a bearer token that does not match the exchange', async () => {
    await withStubs(
      () => {
        const findOneStub = sinon.stub(
          database.collections.Exchanges, 'findOne').resolves(null);
        return [findOneStub];
      },
      async () => {
        const req = {
          workflow,
          params: {exchangeId: exchange.id},
          headers: {authorization: 'Bearer wrong-token'}
        };
        const res = mockRes();
        const next = sinon.spy();

        await authMiddleware(req, res, next);

        expect(next.called).to.be(false);
        expect(res.statusCode).to.equal(404);
      }
    );
  });

  it('accepts the exchange\'s own accessToken as a bearer token',
    async () => {
      await withStubs(
        () => {
          const findOneStub = sinon.stub(
            database.collections.Exchanges, 'findOne').resolves(exchange);
          return [findOneStub];
        },
        async () => {
          const req = {
            workflow,
            params: {exchangeId: exchange.id},
            headers: {authorization: `Bearer ${exchange.accessToken}`}
          };
          const res = mockRes();
          const next = sinon.spy();

          await authMiddleware(req, res, next);

          expect(next.called).to.be(true);
          expect(req.exchange.id).to.equal(exchange.id);
        }
      );
    });
});
