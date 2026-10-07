/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {config} from '@bedrock/core';
import expect from 'expect.js';

import {database} from '../../lib/database.js';
import {exchangeEventMiddleware} from '../../lib/http.js';
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

describe('POST /workflows/:workflowId/exchanges/:exchangeId/events',
  () => {
    let loggerInfoStub;

    beforeEach(() => {
      loggerInfoStub = sinon.stub(logger, 'info');
    });

    afterEach(() => {
      loggerInfoStub.restore();
    });

    it('logs presentation_dc_api_cancelled for type "dcapi_cancelled"', () => {
      const req = {
        workflow,
        exchange,
        body: {type: 'dcapi_cancelled', profile: 'OID4VP-1.0'},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      exchangeEventMiddleware(req, res);

      const cancelled = findEvent(
        loggerInfoStub, 'presentation_dc_api_cancelled');
      expect(cancelled).to.be.ok();
      expect(cancelled[1].clientId).to.equal(workflow.clientId);
      expect(cancelled[1].exchangeId).to.equal(exchange.id);
      expect(cancelled[1].profile).to.equal('OID4VP-1.0');
      expect(res.statusCode).to.equal(204);
    });

    it('logs presentation_dc_api_error for type "dcapi_error"', () => {
      const req = {
        workflow,
        exchange,
        body: {
          type: 'dcapi_error', profile: 'OID4VP-1.0', errorName: 'AbortError'
        },
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      exchangeEventMiddleware(req, res);

      const errored = findEvent(loggerInfoStub, 'presentation_dc_api_error');
      expect(errored).to.be.ok();
      expect(errored[1].clientId).to.equal(workflow.clientId);
      expect(errored[1].exchangeId).to.equal(exchange.id);
      expect(errored[1].errorName).to.equal('AbortError');
      expect(res.statusCode).to.equal(204);
    });

    it('classifies errorMessage into dcApiErrorReason and never logs the ' +
      'raw message for type "dcapi_error"', () => {
      const req = {
        workflow,
        exchange,
        body: {
          type: 'dcapi_error',
          profile: 'OID4VP-1.0',
          errorName: 'NetworkError',
          errorMessage: 'some raw wallet transport detail'
        },
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      exchangeEventMiddleware(req, res);

      const errored = findEvent(loggerInfoStub, 'presentation_dc_api_error');
      expect(errored).to.be.ok();
      // The raw client message must never reach the logs.
      expect(errored[1]).not.to.have.key('errorMessage');
      // Under the empty seed rules an unmapped message classifies as 'other';
      // the UAT-learned strings (spec Phase 1) refine this later.
      expect(errored[1].dcApiErrorReason).to.equal('other');
      expect(res.statusCode).to.equal(204);
    });

    describe('DC API diagnostics', () => {
      const CHROME_ANDROID_UA =
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/141.0.0.0 Mobile Safari/537.36';
      let originalDiagnostics;

      beforeEach(() => {
        originalDiagnostics = config.opencred.options.dcApiDiagnostics;
      });

      afterEach(() => {
        config.opencred.options.dcApiDiagnostics = originalDiagnostics;
      });

      function report(body) {
        const req = {
          workflow,
          exchange,
          body,
          headers: {'user-agent': CHROME_ANDROID_UA}
        };
        const res = mockRes();
        exchangeEventMiddleware(req, res);
        return res;
      }

      const outcomeBody = {
        profile: 'OID4VP-1.0',
        errorMessage: 'raw platform text',
        errorCause: 'raw cause text',
        errorCode: 19,
        elapsedMs: 850,
        context: {hasFocus: true, injected: 'dropped'}
      };

      for(const [type, logType, extra] of [
        ['dcapi_error', 'presentation_dc_api_error',
          {errorName: 'NetworkError'}],
        ['dcapi_cancelled', 'presentation_dc_api_cancelled',
          {errorName: 'NotAllowedError'}],
        ['dcapi_timeout', 'presentation_dc_api_timeout', {timeoutMs: 30000}],
        ['dcapi_flow_error', 'presentation_dc_api_flow_error',
          {errorName: 'HTTPError', phase: 'fetch', httpStatus: 401}]
      ]) {
        it(`logs always-on outcome fields and no raw text for "${type}" ` +
          'when diagnostics are disabled', () => {
          config.opencred.options.dcApiDiagnostics = false;
          const res = report({type, ...outcomeBody, ...extra});

          const [, event] = findEvent(loggerInfoStub, logType);
          expect(event.elapsedMs).to.equal(850);
          expect(event.errorCode).to.equal(19);
          expect(event.errorMessageHash).to.match(/^[0-9a-f]{16}$/);
          expect(event.os).to.equal('android');
          expect(event.browserMajorVersion).to.equal(141);
          expect(event.context).to.eql({hasFocus: true});
          expect(event).not.to.have.key('diagnostics');
          expect(event).not.to.have.key('errorMessage');
          const serialized = JSON.stringify(event);
          expect(serialized).not.to.contain('raw platform text');
          expect(serialized).not.to.contain('raw cause text');
          expect(serialized).not.to.contain('Pixel 8');
          expect(res.statusCode).to.equal(204);
        });

        it(`logs raw diagnostics for "${type}" when diagnostics are enabled`,
          () => {
            config.opencred.options.dcApiDiagnostics = true;
            report({type, ...outcomeBody, ...extra});

            const [, event] = findEvent(loggerInfoStub, logType);
            expect(event.diagnostics).to.eql({
              errorMessage: 'raw platform text',
              errorCause: 'raw cause text',
              userAgent: CHROME_ANDROID_UA
            });
            expect(event.elapsedMs).to.equal(850);
          });
      }

      it('logs errorName on presentation_dc_api_cancelled', () => {
        report({type: 'dcapi_cancelled', errorName: 'AbortError'});
        const [, event] = findEvent(
          loggerInfoStub, 'presentation_dc_api_cancelled');
        expect(event.errorName).to.equal('AbortError');
      });

      it('logs phase and httpStatus on presentation_dc_api_flow_error', () => {
        report({
          type: 'dcapi_flow_error',
          profiles: ['google-wallet'],
          phase: 'submit',
          httpStatus: 500,
          errorName: 'HTTPError'
        });
        const [, event] = findEvent(
          loggerInfoStub, 'presentation_dc_api_flow_error');
        expect(event.phase).to.equal('submit');
        expect(event.httpStatus).to.equal(500);
        expect(event.errorName).to.equal('HTTPError');
        expect(event.profiles).to.eql(['google-wallet']);
      });

      it('does not add DC API outcome fields to non-DC API events', () => {
        report({type: 'exchange_expired', elapsedMs: 5});
        const [, event] = findEvent(loggerInfoStub, 'exchange_expired');
        expect(event).not.to.have.key('elapsedMs');
        expect(event).not.to.have.key('os');
      });
    });

    it('logs presentation_dc_api_timeout for type "dcapi_timeout"', () => {
      const req = {
        workflow,
        exchange,
        body: {type: 'dcapi_timeout', profile: 'OID4VP-1.0', timeoutMs: 30000},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      exchangeEventMiddleware(req, res);

      const timedOut = findEvent(
        loggerInfoStub, 'presentation_dc_api_timeout');
      expect(timedOut).to.be.ok();
      expect(timedOut[1].clientId).to.equal(workflow.clientId);
      expect(timedOut[1].exchangeId).to.equal(exchange.id);
      expect(timedOut[1].timeoutMs).to.equal(30000);
      expect(res.statusCode).to.equal(204);
    });

    it('logs presentation_interaction_picker_opened for type ' +
      '"interaction_picker_opened"', () => {
      const req = {
        workflow,
        exchange,
        body: {type: 'interaction_picker_opened', method: 'dcapi'},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      exchangeEventMiddleware(req, res);

      const opened = findEvent(
        loggerInfoStub, 'presentation_interaction_picker_opened');
      expect(opened).to.be.ok();
      expect(opened[1].clientId).to.equal(workflow.clientId);
      expect(opened[1].exchangeId).to.equal(exchange.id);
      expect(opened[1].method).to.equal('dcapi');
      expect(res.statusCode).to.equal(204);
    });

    it('logs presentation_interaction_method_selected for type ' +
      '"interaction_method_selected"', () => {
      const req = {
        workflow,
        exchange,
        body: {
          type: 'interaction_method_selected',
          fromMethod: 'dcapi',
          toMethod: 'qr-and-link'
        },
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      exchangeEventMiddleware(req, res);

      const selected = findEvent(
        loggerInfoStub, 'presentation_interaction_method_selected');
      expect(selected).to.be.ok();
      expect(selected[1].clientId).to.equal(workflow.clientId);
      expect(selected[1].exchangeId).to.equal(exchange.id);
      expect(selected[1].fromMethod).to.equal('dcapi');
      expect(selected[1].toMethod).to.equal('qr-and-link');
      expect(res.statusCode).to.equal(204);
    });

    it('logs presentation_interaction_picker_dismissed for type ' +
      '"interaction_picker_dismissed"', () => {
      const req = {
        workflow,
        exchange,
        body: {type: 'interaction_picker_dismissed', method: 'qr-and-link'},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      exchangeEventMiddleware(req, res);

      const dismissed = findEvent(
        loggerInfoStub, 'presentation_interaction_picker_dismissed');
      expect(dismissed).to.be.ok();
      expect(dismissed[1].clientId).to.equal(workflow.clientId);
      expect(dismissed[1].exchangeId).to.equal(exchange.id);
      expect(dismissed[1].method).to.equal('qr-and-link');
      expect(res.statusCode).to.equal(204);
    });

    it('logs exchange_expired for type "exchange_expired"', () => {
      const req = {
        workflow,
        exchange,
        body: {type: 'exchange_expired'},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      exchangeEventMiddleware(req, res);

      const expired = findEvent(loggerInfoStub, 'exchange_expired');
      expect(expired).to.be.ok();
      expect(expired[1].clientId).to.equal(workflow.clientId);
      expect(expired[1].exchangeId).to.equal(exchange.id);
      expect(res.statusCode).to.equal(204);
    });

    it('does not record a profile or ttl on exchange_expired', () => {
      // The browser reports neither: no profile is involved in an expiry,
      // and ttl is a deployment-wide setting rather than per-event data.
      const req = {
        workflow,
        exchange,
        body: {type: 'exchange_expired', profile: 'OID4VP-1.0', ttl: 900},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      exchangeEventMiddleware(req, res);

      const expired = findEvent(loggerInfoStub, 'exchange_expired');
      expect(expired).to.be.ok();
      expect(expired[1].profile).to.be(undefined);
      expect(expired[1].ttl).to.be(undefined);
    });

    it('returns 400 for an unrecognized type', () => {
      const req = {
        workflow,
        exchange,
        body: {type: 'bogus'},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      exchangeEventMiddleware(req, res);

      expect(res.statusCode).to.equal(400);
      expect(loggerInfoStub.called).to.be(false);
    });

    it('does not require exchange state to be pending/active', () => {
      const req = {
        workflow,
        exchange: {...exchange, state: 'complete'},
        body: {type: 'dcapi_cancelled'},
        headers: {'user-agent': 'test-agent'}
      };
      const res = mockRes();

      exchangeEventMiddleware(req, res);

      expect(res.statusCode).to.equal(204);
      const cancelled = findEvent(
        loggerInfoStub, 'presentation_dc_api_cancelled');
      expect(cancelled).to.be.ok();
    });
  });

describe('exchange events route auth (getAuthFunction bearer)', () => {
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
