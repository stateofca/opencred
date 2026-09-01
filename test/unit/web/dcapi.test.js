/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import expect from 'expect.js';

import {
  fetchDcApiRequests,
  requestDigitalCredential,
  startDcApiFlow,
  submitDcApiResponse
} from '../../../web/utils/dcapi.js';

// The DC API authorization request endpoint is published directly on the
// exchange rather than parsed back out of an `openid4vp://` deep link: a launch
// may request several profiles, which a deep link cannot express.
const exchangeData = {
  id: 'exchange-1',
  workflowId: 'workflow-1',
  accessToken: 'token',
  dcApi: {
    authorizationRequestUrl:
      'https://verifier.example/workflows/workflow-1/exchanges/exchange-1' +
      '/openid/client/authorization/request'
  }
};

function mockHttpClient({getResponse, postResponse, postError} = {}) {
  const get = sinon.stub().resolves(
    getResponse ?? {data: {
      dcApiRequests: [
        {profile: 'OID4VP-1.0', dcApiRequest: {protocol: 'p', data: {}}}
      ],
      dcApiRequest: {protocol: 'p', data: {}}
    }});
  const post = postError ?
    sinon.stub().rejects(postError) :
    sinon.stub().resolves(postResponse ?? {data: {}});
  return {get, post};
}

describe('startDcApiFlow', () => {
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
      await startDcApiFlow({
        exchangeData, httpClient, profiles: ['OID4VP-1.0']
      });
    } catch(e) {
      thrown = e;
    }

    expect(thrown).to.be.ok();
    expect(httpClient.post.calledOnce).to.be(true);
    const [url, opts] = httpClient.post.firstCall.args;
    expect(url).to.equal(
      '/workflows/workflow-1/exchanges/exchange-1/events');
    expect(opts.json.type).to.equal('dcapi_cancelled');
    expect(opts.json.profile).to.equal('OID4VP-1.0');
  });

  it('reports presentation_dc_api_error on other rejections', async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    globalThis.navigator.credentials = {get: sinon.stub().rejects(error)};
    const httpClient = mockHttpClient();

    let thrown;
    try {
      await startDcApiFlow({
        exchangeData, httpClient, profiles: ['OID4VP-1.0']
      });
    } catch(e) {
      thrown = e;
    }

    expect(thrown).to.be.ok();
    expect(httpClient.post.calledOnce).to.be(true);
    const [url, opts] = httpClient.post.firstCall.args;
    expect(url).to.equal(
      '/workflows/workflow-1/exchanges/exchange-1/events');
    expect(opts.json.type).to.equal('dcapi_error');
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

    await startDcApiFlow({
      exchangeData, httpClient, profiles: ['OID4VP-1.0']
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
      await startDcApiFlow({
        exchangeData, httpClient, profiles: ['OID4VP-1.0']
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
        await startDcApiFlow({
          exchangeData, httpClient, profiles: ['OID4VP-1.0']
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

      const flowPromise = startDcApiFlow({
        exchangeData, httpClient, profiles: ['OID4VP-1.0']
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
        '/workflows/workflow-1/exchanges/exchange-1/events');
      expect(opts.json.type).to.equal('dcapi_timeout');
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
        await startDcApiFlow({
          exchangeData, httpClient, profiles: ['OID4VP-1.0']
        });
      } catch(e) {
        thrown = e;
      }

      expect(thrown).to.be.ok();
      expect(thrown.message).to.equal(
        'The credential request was aborted.');
      const [, opts] = httpClient.post.firstCall.args;
      expect(opts.json.type).to.equal('dcapi_error');
    });

    it('clears the timeout on successful completion (no stray abort)',
      async () => {
        const credentialResponse = {some: 'response'};
        globalThis.navigator.credentials = {
          get: sinon.stub().resolves(credentialResponse)
        };
        const httpClient = mockHttpClient();
        httpClient.post.onFirstCall().resolves({data: {}});

        await startDcApiFlow({
          exchangeData, httpClient, profiles: ['OID4VP-1.0']
        });

        // advancing the clock past the timeout window after completion
        // must not trigger any further beacon call
        await clock.tickAsync(30000);
        expect(httpClient.post.calledOnce).to.be(true);
      });
  });
});

describe('fetchDcApiRequests', () => {
  let originalWindow;

  before(() => {
    originalWindow = globalThis.window;
    globalThis.window = {location: {origin: 'https://verifier.example'}};
  });

  after(() => {
    globalThis.window = originalWindow;
  });

  // One call carries every profile. Fetching them one at a time would leave
  // each request overwriting the last server-side, and would spend several
  // round trips inside the transient user activation that
  // navigator.credentials.get requires.
  it('requests every profile in one call, as repeated profile params',
    async () => {
      const httpClient = mockHttpClient({
        getResponse: {data: {dcApiRequests: [
          {profile: 'apple-wallet', dcApiRequest: {protocol: 'org-iso-mdoc'}},
          {profile: 'google-wallet',
            dcApiRequest: {protocol: 'openid4vp-v1-signed'}}
        ]}}
      });

      const envelopes = await fetchDcApiRequests({
        exchangeData, httpClient,
        profiles: ['apple-wallet', 'google-wallet']
      });

      expect(httpClient.get.calledOnce).to.be(true);
      const [url] = httpClient.get.firstCall.args;
      expect(url).to.contain('profile=apple-wallet');
      expect(url).to.contain('profile=google-wallet');
      expect(envelopes.length).to.equal(2);
      expect(envelopes.map(e => e.profile))
        .to.eql(['apple-wallet', 'google-wallet']);
    });

  it('preserves requested order in the query string', async () => {
    const httpClient = mockHttpClient();
    await fetchDcApiRequests({
      exchangeData, httpClient, profiles: ['a', 'b', 'c']
    });
    const [url] = httpClient.get.firstCall.args;
    expect(url.indexOf('profile=a')).to.be.lessThan(url.indexOf('profile=b'));
    expect(url.indexOf('profile=b')).to.be.lessThan(url.indexOf('profile=c'));
  });

  it('accepts the singular envelope for back-compat', async () => {
    const httpClient = mockHttpClient({
      getResponse: {data: {dcApiRequest: {protocol: 'p', data: {}}}}
    });
    const envelopes = await fetchDcApiRequests({
      exchangeData, httpClient, profiles: ['OID4VP-1.0']
    });
    expect(envelopes.length).to.equal(1);
    expect(envelopes[0].profile).to.equal('OID4VP-1.0');
  });

  it('throws when the exchange has no DC API endpoint', async () => {
    let thrown;
    try {
      await fetchDcApiRequests({
        exchangeData: {id: 'e', workflowId: 'w'},
        httpClient: mockHttpClient(),
        profiles: ['a']
      });
    } catch(e) {
      thrown = e;
    }
    expect(thrown.message).to.contain('authorizationRequestUrl');
  });

  it('throws when no profiles are requested', async () => {
    let thrown;
    try {
      await fetchDcApiRequests({
        exchangeData, httpClient: mockHttpClient(), profiles: []
      });
    } catch(e) {
      thrown = e;
    }
    expect(thrown.message).to.contain('At least one profile');
  });

  it('throws when the response carries no envelopes', async () => {
    let thrown;
    try {
      await fetchDcApiRequests({
        exchangeData,
        httpClient: mockHttpClient({getResponse: {data: {}}}),
        profiles: ['a']
      });
    } catch(e) {
      thrown = e;
    }
    expect(thrown.message).to.contain('dcApiRequests');
  });
});

describe('requestDigitalCredential', () => {
  let originalCredentials;

  afterEach(() => {
    globalThis.navigator.credentials = originalCredentials;
  });

  // Every request goes to the platform at once; each wallet answers the one it
  // understands.
  it('passes all requests in a single digital.requests array', async () => {
    const get = sinon.stub().resolves({protocol: 'org-iso-mdoc'});
    globalThis.navigator.credentials = {get};

    const requests = [
      {protocol: 'org-iso-mdoc', data: {}},
      {protocol: 'openid4vp-v1-signed', data: {}}
    ];
    await requestDigitalCredential({requests});

    const [options] = get.firstCall.args;
    expect(options.digital.requests).to.eql(requests);
    expect(options.mediation).to.equal('required');
  });

  it('throws when the platform returns no credential', async () => {
    globalThis.navigator.credentials = {get: sinon.stub().resolves(null)};
    let thrown;
    try {
      await requestDigitalCredential({requests: [{protocol: 'p', data: {}}]});
    } catch(e) {
      thrown = e;
    }
    expect(thrown.message).to.contain('No credential');
  });

  it('requires at least one request', async () => {
    let thrown;
    try {
      await requestDigitalCredential({requests: []});
    } catch(e) {
      thrown = e;
    }
    expect(thrown.message).to.contain('At least one DC API request');
  });
});

describe('submitDcApiResponse', () => {
  it('forwards the response unaltered and names the answering profile',
    async () => {
      const httpClient = mockHttpClient();
      const credentialResponse = {protocol: 'org-iso-mdoc', data: {x: 1}};

      await submitDcApiResponse({
        exchangeData, httpClient, credentialResponse,
        profile: 'apple-wallet'
      });

      const [url, opts] = httpClient.post.firstCall.args;
      expect(url).to.contain(
        '/openid/client/authorization/response');
      expect(url).to.contain('profile=apple-wallet');
      expect(opts.json).to.eql(credentialResponse);
    });

  it('omits the profile hint when it cannot be determined', async () => {
    const httpClient = mockHttpClient();
    await submitDcApiResponse({
      exchangeData, httpClient, credentialResponse: {protocol: 'p'}
    });
    const [url] = httpClient.post.firstCall.args;
    expect(url).to.not.contain('profile=');
  });
});

describe('startDcApiFlow with several profiles', () => {
  let originalCredentials;
  let originalWindow;

  before(() => {
    originalCredentials = globalThis.navigator?.credentials;
    originalWindow = globalThis.window;
    globalThis.window = {location: {origin: 'https://verifier.example'}};
  });

  after(() => {
    globalThis.window = originalWindow;
  });

  afterEach(() => {
    globalThis.navigator.credentials = originalCredentials;
  });

  function twoProfileClient() {
    return mockHttpClient({
      getResponse: {data: {dcApiRequests: [
        {profile: 'apple-wallet', dcApiRequest: {protocol: 'org-iso-mdoc'}},
        {profile: 'google-wallet',
          dcApiRequest: {protocol: 'openid4vp-v1-signed'}}
      ]}}
    });
  }

  // The platform never says which request was answered, so the answering
  // profile is inferred from the response protocol — as a diagnostic hint only;
  // the server does its own authoritative matching.
  it('names the answering profile from the response protocol', async () => {
    globalThis.navigator.credentials = {
      get: sinon.stub().resolves({protocol: 'openid4vp-v1-signed'})
    };
    const httpClient = twoProfileClient();

    await startDcApiFlow({
      exchangeData, httpClient, profiles: ['apple-wallet', 'google-wallet']
    });

    const [url] = httpClient.post.firstCall.args;
    expect(url).to.contain('profile=google-wallet');
  });

  it('leaves the profile unattributed for an unrecognized protocol',
    async () => {
      globalThis.navigator.credentials = {
        get: sinon.stub().resolves({protocol: 'something-else'})
      };
      const httpClient = twoProfileClient();

      await startDcApiFlow({
        exchangeData, httpClient, profiles: ['apple-wallet', 'google-wallet']
      });

      const [url] = httpClient.post.firstCall.args;
      expect(url).to.not.contain('profile=');
    });

  // A dismissed platform sheet means NO profile answered, so attributing the
  // outcome to one of them would be a fabrication.
  it('reports the whole offered set when the user cancels', async () => {
    const error = new Error('denied');
    error.name = 'NotAllowedError';
    globalThis.navigator.credentials = {get: sinon.stub().rejects(error)};
    const httpClient = twoProfileClient();

    try {
      await startDcApiFlow({
        exchangeData, httpClient, profiles: ['apple-wallet', 'google-wallet']
      });
    } catch {
      // expected
    }

    const [url, opts] = httpClient.post.firstCall.args;
    expect(url).to.contain('/events');
    expect(opts.json.type).to.equal('dcapi_cancelled');
    expect(opts.json.profiles).to.eql(['apple-wallet', 'google-wallet']);
    // No singular `profile`: none of them answered.
    expect(opts.json.profile).to.be(undefined);
  });

  it('still sends the singular profile when only one was offered', async () => {
    const error = new Error('denied');
    error.name = 'NotAllowedError';
    globalThis.navigator.credentials = {get: sinon.stub().rejects(error)};
    const httpClient = mockHttpClient();

    try {
      await startDcApiFlow({
        exchangeData, httpClient, profiles: ['OID4VP-1.0']
      });
    } catch {
      // expected
    }

    const [, opts] = httpClient.post.firstCall.args;
    expect(opts.json.profile).to.equal('OID4VP-1.0');
    expect(opts.json.profiles).to.eql(['OID4VP-1.0']);
  });
});
