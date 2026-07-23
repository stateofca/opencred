/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {config} from '@bedrock/core';
import expect from 'expect.js';
import {httpClient} from '@digitalbazaar/http-client';
import {sendCallback} from '../../lib/callback.js';

const CALLBACK_URL = 'https://api.callback.example.com';

const baseWorkflow = {
  clientId: 'callback-test'
};

function makeExchange(overrides = {}) {
  return {
    id: 'exchange-123',
    workflowId: 'callback-test',
    step: 'default',
    variables: {
      caseId: 'CASE-1',
      color: 'blue',
      results: {
        default: {
          verifiablePresentation: {
            type: ['VerifiablePresentation'],
            verifiableCredential: [{
              type: ['VerifiableCredential'],
              credentialSubject: {name: 'Jane'}
            }]
          },
          vpToken: 'raw.vp.token'
        }
      }
    },
    ...overrides
  };
}

// Returns the payload (json) sent to the callback URL.
function callbackPayload(postStub) {
  const call = postStub.getCalls().find(c => c.args[0] === CALLBACK_URL);
  return call?.args[1]?.json;
}

// Returns the headers sent to the callback URL.
function callbackHeaders(postStub) {
  const call = postStub.getCalls().find(c => c.args[0] === CALLBACK_URL);
  return call?.args[1]?.headers;
}

describe('Callback - sendCallback', function() {
  let postStub;

  beforeEach(function() {
    postStub = sinon.stub(httpClient, 'post');
    postStub.resolves({data: {}});
  });

  afterEach(function() {
    postStub.restore();
  });

  it('returns true and sends nothing when no callback is configured',
    async function() {
      const workflow = {...baseWorkflow};
      const result = await sendCallback(workflow, makeExchange());
      expect(result).to.be(true);
      expect(postStub.called).to.be(false);
    });

  describe('legacy body (callback.body unset)', function() {
    it('sends the full set of exchange variables', async function() {
      const workflow = {...baseWorkflow, callback: {url: CALLBACK_URL}};
      const exchange = makeExchange();
      const result = await sendCallback(workflow, exchange);

      expect(result).to.be(true);
      expect(postStub.calledOnce).to.be(true);
      const payload = callbackPayload(postStub);
      expect(payload.step).to.be('default');
      expect(payload.id).to.contain(
        '/workflows/callback-test/exchanges/exchange-123');
      // full variables (including results) are forwarded
      expect(payload.variables).to.eql(exchange.variables);
      expect(payload.variables.results.default.vpToken).to.be('raw.vp.token');
      // no top-level presentation artifacts in legacy mode
      expect(payload).to.not.have.property('vpToken');
      expect(payload).to.not.have.property('verifiablePresentation');
      expect(payload).to.not.have.property('verifiableCredential');
    });
  });

  describe('curated body (callback.body set)', function() {
    it('omits all plain variables when body.variables is unset',
      async function() {
        const workflow = {
          ...baseWorkflow,
          callback: {url: CALLBACK_URL, body: {}}
        };
        await sendCallback(workflow, makeExchange());
        const payload = callbackPayload(postStub);
        expect(payload.variables).to.eql({});
        // results blob is never forwarded in curated mode
        expect(payload.variables).to.not.have.property('results');
      });

    it('includes only allowlisted variables', async function() {
      const workflow = {
        ...baseWorkflow,
        callback: {url: CALLBACK_URL, body: {variables: ['caseId']}}
      };
      await sendCallback(workflow, makeExchange());
      const payload = callbackPayload(postStub);
      expect(payload.variables).to.eql({caseId: 'CASE-1'});
      expect(payload.variables).to.not.have.property('color');
      expect(payload.variables).to.not.have.property('results');
    });

    it('ignores allowlisted variables that are not present', async function() {
      const workflow = {
        ...baseWorkflow,
        callback: {url: CALLBACK_URL, body: {variables: ['caseId', 'missing']}}
      };
      await sendCallback(workflow, makeExchange());
      const payload = callbackPayload(postStub);
      expect(payload.variables).to.eql({caseId: 'CASE-1'});
    });

    it('includes the raw vpToken when body.vpToken is true',
      async function() {
        const workflow = {
          ...baseWorkflow,
          callback: {url: CALLBACK_URL, body: {vpToken: true}}
        };
        await sendCallback(workflow, makeExchange());
        const payload = callbackPayload(postStub);
        expect(payload.vpToken).to.be('raw.vp.token');
        expect(payload).to.not.have.property('verifiablePresentation');
        expect(payload).to.not.have.property('verifiableCredential');
      });

    it('includes the verifiablePresentation when the flag is true',
      async function() {
        const workflow = {
          ...baseWorkflow,
          callback: {url: CALLBACK_URL, body: {verifiablePresentation: true}}
        };
        const exchange = makeExchange();
        await sendCallback(workflow, exchange);
        const payload = callbackPayload(postStub);
        expect(payload.verifiablePresentation).to.eql(
          exchange.variables.results.default.verifiablePresentation);
        expect(payload).to.not.have.property('vpToken');
      });

    it('includes the verifiableCredential(s) when the flag is true',
      async function() {
        const workflow = {
          ...baseWorkflow,
          callback: {url: CALLBACK_URL, body: {verifiableCredential: true}}
        };
        const exchange = makeExchange();
        await sendCallback(workflow, exchange);
        const payload = callbackPayload(postStub);
        expect(payload.verifiableCredential).to.eql(
          exchange.variables.results.default
            .verifiablePresentation.verifiableCredential);
      });

    it('combines variables and presentation artifacts', async function() {
      const workflow = {
        ...baseWorkflow,
        callback: {
          url: CALLBACK_URL,
          body: {
            variables: ['caseId', 'color'],
            vpToken: true,
            verifiablePresentation: true,
            verifiableCredential: true
          }
        }
      };
      await sendCallback(workflow, makeExchange());
      const payload = callbackPayload(postStub);
      expect(payload.variables).to.eql({caseId: 'CASE-1', color: 'blue'});
      expect(payload.vpToken).to.be('raw.vp.token');
      expect(payload).to.have.property('verifiablePresentation');
      expect(payload).to.have.property('verifiableCredential');
    });

    it('omits presentation artifacts when results are missing',
      async function() {
        const workflow = {
          ...baseWorkflow,
          callback: {
            url: CALLBACK_URL,
            body: {vpToken: true, verifiablePresentation: true}
          }
        };
        const exchange = makeExchange({variables: {caseId: 'CASE-1'}});
        const result = await sendCallback(workflow, exchange);
        expect(result).to.be(true);
        const payload = callbackPayload(postStub);
        expect(payload).to.not.have.property('vpToken');
        expect(payload).to.not.have.property('verifiablePresentation');
      });
  });

  describe('headers', function() {
    it('merges static headers from callback.headers', async function() {
      const workflow = {
        ...baseWorkflow,
        callback: {url: CALLBACK_URL, headers: {'x-api-key': 'secret'}}
      };
      await sendCallback(workflow, makeExchange());
      const headers = callbackHeaders(postStub);
      expect(headers['x-api-key']).to.be('secret');
    });

    it('merges dynamic headers from headersVariable', async function() {
      const workflow = {
        ...baseWorkflow,
        callback: {url: CALLBACK_URL, headersVariable: 'callbackHeaders'}
      };
      const exchange = makeExchange();
      exchange.variables.callbackHeaders = {'x-trace-id': 'abc123'};
      await sendCallback(workflow, exchange);
      const headers = callbackHeaders(postStub);
      expect(headers['x-trace-id']).to.be('abc123');
    });

    it('lets static headers override dynamic headers', async function() {
      const workflow = {
        ...baseWorkflow,
        callback: {
          url: CALLBACK_URL,
          headersVariable: 'callbackHeaders',
          headers: {'x-shared': 'static'}
        }
      };
      const exchange = makeExchange();
      exchange.variables.callbackHeaders = {'x-shared': 'dynamic'};
      await sendCallback(workflow, exchange);
      const headers = callbackHeaders(postStub);
      expect(headers['x-shared']).to.be('static');
    });

    it('fails when headersVariable is configured but missing',
      async function() {
        const workflow = {
          ...baseWorkflow,
          callback: {url: CALLBACK_URL, headersVariable: 'callbackHeaders'}
        };
        const exchange = makeExchange({variables: {caseId: 'CASE-1'}});
        const result = await sendCallback(workflow, exchange);
        expect(result).to.be(false);
        expect(postStub.called).to.be(false);
      });
  });

  describe('oauth authentication', function() {
    const issuer = 'https://issuer.callback-test.example.com';
    const tokenUrl = `${issuer}/token`;
    let originalAuthorization;

    beforeEach(function() {
      // config.opencred.authorization may be unset by default, so assign it
      // directly rather than stubbing a non-existent property.
      originalAuthorization = config.opencred.authorization;
      config.opencred.authorization = [{
        issuer,
        client_id: 'callback-oauth-client',
        client_secret: 'shhh',
        token_endpoint: tokenUrl,
        grant_type: 'client_credentials',
        scope: 'read'
      }];
      postStub.withArgs(tokenUrl, sinon.match.any)
        .resolves({data: {access_token: 'ACCESS-TOKEN'}});
    });

    afterEach(function() {
      if(originalAuthorization === undefined) {
        delete config.opencred.authorization;
      } else {
        config.opencred.authorization = originalAuthorization;
      }
    });

    it('sends a bearer token on the callback request', async function() {
      const workflow = {
        ...baseWorkflow,
        callback: {
          url: CALLBACK_URL,
          oauth: {
            issuer,
            tokenUrl,
            clientId: 'callback-oauth-client',
            clientSecret: 'shhh',
            scope: ['read']
          }
        }
      };
      const result = await sendCallback(workflow, makeExchange());
      expect(result).to.be(true);
      const headers = callbackHeaders(postStub);
      expect(headers.Authorization).to.be('Bearer ACCESS-TOKEN');
    });
  });

  describe('failure handling', function() {
    it('returns false when the callback request rejects', async function() {
      const workflow = {...baseWorkflow, callback: {url: CALLBACK_URL}};
      postStub.withArgs(CALLBACK_URL, sinon.match.any).rejects({
        status: 400,
        name: 'InvalidRequestError',
        requestUrl: CALLBACK_URL,
        message: 'Invalid request structure'
      });
      const result = await sendCallback(workflow, makeExchange());
      expect(result).to.be(false);
    });
  });
});
