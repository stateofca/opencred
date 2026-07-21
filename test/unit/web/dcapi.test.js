/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import expect from 'expect.js';

import {startDCApiFlow} from '../../../web/utils/dcapi.js';

const exchangeData = {
  id: 'exchange-1',
  workflowId: 'workflow-1',
  accessToken: 'token',
  protocols: {
    'OID4VP-1.0': 'openid4vp://authorize?request_uri=' +
      encodeURIComponent('https://verifier.example/openid/client/' +
        'authorization/request?profile=OID4VP-1.0')
  }
};

function mockHttpClient({getResponse, postResponse, postError} = {}) {
  const get = sinon.stub().resolves(
    getResponse ?? {data: {dcApiRequest: {protocol: 'p', data: {}}}});
  const post = postError ?
    sinon.stub().rejects(postError) :
    sinon.stub().resolves(postResponse ?? {data: {}});
  return {get, post};
}

describe('startDCApiFlow', () => {
  let originalCredentials;
  let originalWindow;

  before(() => {
    originalCredentials = globalThis.navigator?.credentials;
    originalWindow = globalThis.window;
    if(!globalThis.navigator) {
      globalThis.navigator = {};
    }
    globalThis.window = {location: {origin: 'https://verifier.example'}};
  });

  after(() => {
    globalThis.window = originalWindow;
  });

  afterEach(() => {
    globalThis.navigator.credentials = originalCredentials;
  });

  it('reports presentation_dc_api_cancelled on NotAllowedError', async () => {
    const error = new Error('denied');
    error.name = 'NotAllowedError';
    globalThis.navigator.credentials = {get: sinon.stub().rejects(error)};
    const httpClient = mockHttpClient();

    let thrown;
    try {
      await startDCApiFlow({
        exchangeData, httpClient, selectedProtocol: 'OID4VP-1.0'
      });
    } catch(e) {
      thrown = e;
    }

    expect(thrown).to.be.ok();
    expect(httpClient.post.calledOnce).to.be(true);
    const [url, opts] = httpClient.post.firstCall.args;
    expect(url).to.equal(
      '/workflows/workflow-1/exchanges/exchange-1/dc-api-event');
    expect(opts.json.type).to.equal('cancelled');
    expect(opts.json.profile).to.equal('OID4VP-1.0');
  });

  it('reports presentation_dc_api_error on other rejections', async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    globalThis.navigator.credentials = {get: sinon.stub().rejects(error)};
    const httpClient = mockHttpClient();

    let thrown;
    try {
      await startDCApiFlow({
        exchangeData, httpClient, selectedProtocol: 'OID4VP-1.0'
      });
    } catch(e) {
      thrown = e;
    }

    expect(thrown).to.be.ok();
    expect(httpClient.post.calledOnce).to.be(true);
    const [url, opts] = httpClient.post.firstCall.args;
    expect(url).to.equal(
      '/workflows/workflow-1/exchanges/exchange-1/dc-api-event');
    expect(opts.json.type).to.equal('error');
    expect(opts.json.errorName).to.equal('AbortError');
  });

  it('does not report a beacon on successful completion', async () => {
    const credentialResponse = {some: 'response'};
    globalThis.navigator.credentials = {
      get: sinon.stub().resolves(credentialResponse)
    };
    const httpClient = mockHttpClient();
    // second post call is the real authorization/response submission
    httpClient.post.onFirstCall().resolves({data: {}});

    await startDCApiFlow({
      exchangeData, httpClient, selectedProtocol: 'OID4VP-1.0'
    });

    // only the real authorization/response POST happened, no beacon
    expect(httpClient.post.calledOnce).to.be(true);
    const [url] = httpClient.post.firstCall.args;
    expect(url).to.equal(
      '/workflows/workflow-1/exchanges/exchange-1/openid/client/' +
      'authorization/response');
  });

  it('does not report a beacon for pre-navigator setup failures', async () => {
    globalThis.navigator.credentials = {get: sinon.stub()};
    const httpClient = mockHttpClient({
      getResponse: {data: {}} // missing dcApiRequest envelope
    });

    let thrown;
    try {
      await startDCApiFlow({
        exchangeData, httpClient, selectedProtocol: 'OID4VP-1.0'
      });
    } catch(e) {
      thrown = e;
    }

    expect(thrown).to.be.ok();
    expect(httpClient.post.called).to.be(false);
    expect(globalThis.navigator.credentials.get.called).to.be(false);
  });

  it('beacon failures do not throw or change the user-facing error',
    async () => {
      const error = new Error('denied');
      error.name = 'NotAllowedError';
      globalThis.navigator.credentials = {get: sinon.stub().rejects(error)};
      const httpClient = mockHttpClient();
      httpClient.post.rejects(new Error('beacon network failure'));

      let thrown;
      try {
        await startDCApiFlow({
          exchangeData, httpClient, selectedProtocol: 'OID4VP-1.0'
        });
      } catch(e) {
        thrown = e;
      }

      expect(thrown).to.be.ok();
      expect(thrown.message).to.equal(
        'The credential request was denied or cancelled.');
    });

  describe('timeout handling', () => {
    let clock;

    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
    });

    it('reports presentation_dc_api_timeout when the client timeout ' +
      'fires before the wallet ever responds', async () => {
      // never resolves/rejects on its own — only our timeout's abort()
      // will end this call, via the AbortSignal
      let signalRef;
      globalThis.navigator.credentials = {
        get: sinon.stub().callsFake(({signal}) => new Promise((_, reject) => {
          signalRef = signal;
          signal.addEventListener('abort', () => {
            const abortError = new Error('aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        }))
      };
      const httpClient = mockHttpClient();

      const flowPromise = startDCApiFlow({
        exchangeData, httpClient, selectedProtocol: 'OID4VP-1.0'
      });
      // let the microtask queue advance so navigator.credentials.get is
      // actually invoked and its signal listener attached before we
      // fast-forward the clock
      await Promise.resolve();
      await Promise.resolve();
      expect(signalRef).to.be.ok();

      await clock.tickAsync(30000);

      let thrown;
      try {
        await flowPromise;
      } catch(e) {
        thrown = e;
      }

      expect(thrown).to.be.ok();
      expect(thrown.message).to.equal(
        'Your wallet app did not respond. Try again or use another ' +
        'connection method.');
      expect(httpClient.post.calledOnce).to.be(true);
      const [url, opts] = httpClient.post.firstCall.args;
      expect(url).to.equal(
        '/workflows/workflow-1/exchanges/exchange-1/dc-api-event');
      expect(opts.json.type).to.equal('timeout');
      expect(opts.json.timeoutMs).to.equal(30000);
    });

    it('reports presentation_dc_api_error, not timeout, for a genuine ' +
      'AbortError that occurs before the timeout fires', async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      globalThis.navigator.credentials = {get: sinon.stub().rejects(error)};
      const httpClient = mockHttpClient();

      let thrown;
      try {
        await startDCApiFlow({
          exchangeData, httpClient, selectedProtocol: 'OID4VP-1.0'
        });
      } catch(e) {
        thrown = e;
      }

      expect(thrown).to.be.ok();
      expect(thrown.message).to.equal(
        'The credential request was aborted.');
      const [, opts] = httpClient.post.firstCall.args;
      expect(opts.json.type).to.equal('error');
    });

    it('clears the timeout on successful completion (no stray abort)',
      async () => {
        const credentialResponse = {some: 'response'};
        globalThis.navigator.credentials = {
          get: sinon.stub().resolves(credentialResponse)
        };
        const httpClient = mockHttpClient();
        httpClient.post.onFirstCall().resolves({data: {}});

        await startDCApiFlow({
          exchangeData, httpClient, selectedProtocol: 'OID4VP-1.0'
        });

        // advancing the clock past the timeout window after completion
        // must not trigger any further beacon call
        await clock.tickAsync(30000);
        expect(httpClient.post.calledOnce).to.be(true);
      });
  });
});
