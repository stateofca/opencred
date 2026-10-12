/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import expect from 'expect.js';

import {
  _buildDcApiFlowErrorEvent,
  _buildDcApiOutcomeEvent,
  _captureDcApiContext,
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

  it('reports presentation_dc_api_error on a genuine non-cancel rejection',
    async () => {
      // Not a user-dismissal name (NotAllowedError / AbortError) and not our
      // own timeout, so it must remain a delivery error.
      const error = new Error('network failure');
      error.name = 'NetworkError';
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
      expect(opts.json.errorName).to.equal('NetworkError');
      // The raw message rides along for server-side classification; the
      // server logs it only when `options.dcApiDiagnostics` is on.
      expect(opts.json.errorMessage).to.equal('network failure');
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

  it('reports dcapi_flow_error with phase "fetch" when the envelope fetch ' +
    'fails', async () => {
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
    expect(thrown.message).to.contain('missing `dcApiRequests`');
    expect(globalThis.navigator.credentials.get.called).to.be(false);
    expect(httpClient.post.calledOnce).to.be(true);
    const [url, opts] = httpClient.post.firstCall.args;
    expect(url).to.equal(
      '/workflows/workflow-1/exchanges/exchange-1/events');
    expect(opts.json.type).to.equal('dcapi_flow_error');
    expect(opts.json.phase).to.equal('fetch');
    // No envelope came back, so the offered set is the requested profiles.
    expect(opts.json.profiles).to.eql(['OID4VP-1.0']);
  });

  it('reports the HTTP status of a failed envelope fetch', async () => {
    globalThis.navigator.credentials = {get: sinon.stub()};
    const httpError = new Error('Unauthorized');
    httpError.name = 'HTTPError';
    httpError.status = 401;
    const httpClient = mockHttpClient();
    httpClient.get = sinon.stub().rejects(httpError);

    try {
      await startDcApiFlow({
        exchangeData, httpClient, profiles: ['OID4VP-1.0']
      });
    } catch {
      // the flow rethrows; only the beacon is under test
    }

    const [, opts] = httpClient.post.firstCall.args;
    expect(opts.json.type).to.equal('dcapi_flow_error');
    expect(opts.json.phase).to.equal('fetch');
    expect(opts.json.httpStatus).to.equal(401);
    expect(opts.json.errorName).to.equal('HTTPError');
    expect(opts.json.errorMessage).to.equal('Unauthorized');
  });

  it('reports dcapi_flow_error with phase "submit" when posting the wallet ' +
    'response fails', async () => {
    globalThis.navigator.credentials = {
      get: sinon.stub().resolves({protocol: 'p', data: {}})
    };
    const submitError = new Error('Internal Server Error');
    submitError.name = 'HTTPError';
    submitError.status = 500;
    const httpClient = mockHttpClient();
    httpClient.post.onFirstCall().rejects(submitError);
    httpClient.post.onSecondCall().resolves({data: {}});

    let thrown;
    try {
      await startDcApiFlow({
        exchangeData, httpClient, profiles: ['OID4VP-1.0']
      });
    } catch(e) {
      thrown = e;
    }

    // The user-facing error is the submit error, unchanged.
    expect(thrown).to.be(submitError);
    expect(httpClient.post.calledTwice).to.be(true);
    const [url, opts] = httpClient.post.secondCall.args;
    expect(url).to.equal(
      '/workflows/workflow-1/exchanges/exchange-1/events');
    expect(opts.json.type).to.equal('dcapi_flow_error');
    expect(opts.json.phase).to.equal('submit');
    expect(opts.json.httpStatus).to.equal(500);
    expect(opts.json.profile).to.equal('OID4VP-1.0');
  });

  it('reports a navigator rejection once, not again as a flow error',
    async () => {
      const error = new Error('network failure');
      error.name = 'NetworkError';
      globalThis.navigator.credentials = {get: sinon.stub().rejects(error)};
      const httpClient = mockHttpClient();

      try {
        await startDcApiFlow({
          exchangeData, httpClient, profiles: ['OID4VP-1.0']
        });
      } catch {
        // the flow rethrows; only the beacon is under test
      }

      expect(httpClient.post.calledOnce).to.be(true);
      expect(httpClient.post.firstCall.args[1].json.type)
        .to.equal('dcapi_error');
    });

  it('sends elapsedMs and the captured context with a navigator rejection',
    async () => {
      const error = new Error('network failure');
      error.name = 'NetworkError';
      globalThis.navigator.credentials = {get: sinon.stub().rejects(error)};
      const httpClient = mockHttpClient();

      try {
        await startDcApiFlow({
          exchangeData, httpClient, profiles: ['OID4VP-1.0']
        });
      } catch {
        // the flow rethrows; only the beacon is under test
      }

      const [, opts] = httpClient.post.firstCall.args;
      expect(opts.json.elapsedMs).to.be.a('number');
      expect(opts.json.elapsedMs).to.be.greaterThan(-1);
      expect(opts.json.context).to.be.an('object');
      expect(opts.json.context.protocolSupport).to.eql(
        [{protocol: 'p', allowed: null}]);
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

      await clock.tickAsync(120000);

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
      expect(opts.json.timeoutMs).to.equal(120000);
    });

    it('reports dcapi_cancelled, not timeout, for a non-timeout AbortError ' +
      '(Safari/iOS reports a user dismissal this way)', async () => {
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
        'The credential request was denied or cancelled.');
      const [, opts] = httpClient.post.firstCall.args;
      // A non-timeout AbortError is a browser/OS dismissal, normalized to the
      // same cancellation outcome as NotAllowedError so reporting is
      // consistent across browsers.
      expect(opts.json.type).to.equal('dcapi_cancelled');
      // The original DOMException name is preserved for diagnostics.
      expect(opts.json.errorName).to.equal('AbortError');
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
        await clock.tickAsync(120000);
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

  before(() => {
    originalCredentials = globalThis.navigator?.credentials;
  });

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

describe('_buildDcApiOutcomeEvent', () => {
  function networkError(message = 'network failure') {
    const error = new Error(message);
    error.name = 'NetworkError';
    return error;
  }

  it('builds a dcapi_error event with errorName and a raw errorMessage',
    () => {
      const event = _buildDcApiOutcomeEvent({
        error: networkError(), timedOut: false, profiles: ['OID4VP-1.0']
      });
      expect(event.type).to.equal('dcapi_error');
      expect(event.errorName).to.equal('NetworkError');
      expect(event.errorMessage).to.equal('network failure');
    });

  // NotAllowedError also covers a missing user activation and a
  // permissions-policy denial, not only a user dismissal, so the raw message
  // is sent on cancellations too.
  it('builds a dcapi_cancelled event with errorMessage for NotAllowedError',
    () => {
      const error = new Error('denied');
      error.name = 'NotAllowedError';
      const event = _buildDcApiOutcomeEvent({
        error, timedOut: false, profiles: ['OID4VP-1.0']
      });
      expect(event.type).to.equal('dcapi_cancelled');
      expect(event.errorName).to.equal('NotAllowedError');
      expect(event.errorMessage).to.equal('denied');
    });

  it('builds a dcapi_cancelled event with errorMessage for AbortError',
    () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      const event = _buildDcApiOutcomeEvent({
        error, timedOut: false, profiles: ['OID4VP-1.0']
      });
      expect(event.type).to.equal('dcapi_cancelled');
      expect(event.errorMessage).to.equal('aborted');
    });

  it('builds a dcapi_timeout event with timeoutMs and no errorName or ' +
    'errorMessage', () => {
    const event = _buildDcApiOutcomeEvent({
      error: networkError(), timedOut: true, profiles: ['OID4VP-1.0']
    });
    expect(event.type).to.equal('dcapi_timeout');
    expect(event.timeoutMs).to.equal(30000);
    expect(event).not.to.have.key('errorName');
    expect(event).not.to.have.key('errorMessage');
  });

  it('caps a long errorMessage at 1000 characters', () => {
    const long = 'x'.repeat(1500);
    const event = _buildDcApiOutcomeEvent({
      error: networkError(long), timedOut: false, profiles: ['OID4VP-1.0']
    });
    expect(event.errorMessage.length).to.equal(1000);
  });

  it('includes the DOMException legacy code when it is an integer', () => {
    const error = networkError();
    Object.defineProperty(error, 'code', {value: 19});
    const event = _buildDcApiOutcomeEvent({
      error, timedOut: false, profiles: ['OID4VP-1.0']
    });
    expect(event.errorCode).to.equal(19);
  });

  it('omits errorCode when the error has none', () => {
    const event = _buildDcApiOutcomeEvent({
      error: networkError(), timedOut: false, profiles: ['OID4VP-1.0']
    });
    expect(event).not.to.have.key('errorCode');
  });

  it('includes a capped errorCause from an Error cause or a string cause',
    () => {
      const withError = new Error('outer', {cause: new Error('inner')});
      withError.name = 'NetworkError';
      expect(_buildDcApiOutcomeEvent({
        error: withError, timedOut: false, profiles: ['OID4VP-1.0']
      }).errorCause).to.equal('inner');

      const withString = new Error('outer', {cause: 'y'.repeat(1500)});
      withString.name = 'NetworkError';
      expect(_buildDcApiOutcomeEvent({
        error: withString, timedOut: false, profiles: ['OID4VP-1.0']
      }).errorCause.length).to.equal(1000);
    });

  it('forwards elapsedMs and context annotated by requestDigitalCredential',
    () => {
      const error = networkError();
      error.dcApiElapsedMs = 812;
      error.dcApiContext = {hasFocus: true};
      for(const timedOut of [false, true]) {
        const event = _buildDcApiOutcomeEvent({
          error, timedOut, profiles: ['OID4VP-1.0']
        });
        expect(event.elapsedMs).to.equal(812);
        expect(event.context).to.eql({hasFocus: true});
      }
    });

  it('includes the singular profile only when exactly one was offered', () => {
    const one = _buildDcApiOutcomeEvent({
      error: networkError(), timedOut: false, profiles: ['OID4VP-1.0']
    });
    expect(one.profile).to.equal('OID4VP-1.0');

    const many = _buildDcApiOutcomeEvent({
      error: networkError(), timedOut: false,
      profiles: ['OID4VP-1.0', 'apple-wallet']
    });
    expect(many).not.to.have.key('profile');
    expect(many.profiles).to.eql(['OID4VP-1.0', 'apple-wallet']);
  });
});

describe('_buildDcApiFlowErrorEvent', () => {
  it('builds a dcapi_flow_error event with phase, status, and raw text',
    () => {
      const error = new Error('Unauthorized', {cause: 'token expired'});
      error.name = 'HTTPError';
      error.status = 401;
      const event = _buildDcApiFlowErrorEvent({
        error, phase: 'fetch', profiles: ['OID4VP-1.0', 'apple-wallet']
      });
      expect(event).to.eql({
        type: 'dcapi_flow_error',
        phase: 'fetch',
        profiles: ['OID4VP-1.0', 'apple-wallet'],
        errorName: 'HTTPError',
        errorMessage: 'Unauthorized',
        errorCause: 'token expired',
        httpStatus: 401
      });
    });

  it('omits httpStatus for a non-HTTP failure', () => {
    const event = _buildDcApiFlowErrorEvent({
      error: new TypeError('Failed to fetch'), phase: 'submit',
      profiles: ['OID4VP-1.0']
    });
    expect(event).not.to.have.key('httpStatus');
    expect(event.errorName).to.equal('TypeError');
    expect(event.profile).to.equal('OID4VP-1.0');
  });
});

describe('_captureDcApiContext', () => {
  const saved = {};

  beforeEach(() => {
    for(const key of ['navigator', 'document', 'window', 'DigitalCredential']) {
      saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    }
  });

  afterEach(() => {
    for(const [key, descriptor] of Object.entries(saved)) {
      if(descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    }
  });

  function setGlobal(key, value) {
    Object.defineProperty(
      globalThis, key, {value, configurable: true, writable: true});
  }

  const requests = [
    {protocol: 'openid4vp-v1-signed', data: {}},
    {protocol: 'org-iso-mdoc', data: {}}
  ];

  it('captures activation, visibility, focus, framing, and protocol support',
    () => {
      setGlobal('navigator', {
        userActivation: {isActive: true, hasBeenActive: true}
      });
      setGlobal('document', {visibilityState: 'visible', hasFocus: () => true});
      const self = {};
      self.self = self;
      self.top = self;
      setGlobal('window', self);
      setGlobal('DigitalCredential', {
        userAgentAllowsProtocol: protocol => protocol === 'org-iso-mdoc'
      });

      expect(_captureDcApiContext({requests})).to.eql({
        userActivationIsActive: true,
        userActivationHasBeenActive: true,
        visibilityState: 'visible',
        hasFocus: true,
        inIframe: false,
        digitalCredentialDefined: true,
        protocolSupport: [
          {protocol: 'openid4vp-v1-signed', allowed: false},
          {protocol: 'org-iso-mdoc', allowed: true}
        ]
      });
    });

  it('reports inIframe when the page is framed', () => {
    setGlobal('window', {self: {}, top: {}});
    expect(_captureDcApiContext({requests}).inIframe).to.be(true);
  });

  it('reports allowed: null when userAgentAllowsProtocol is unavailable or ' +
    'throws', () => {
    setGlobal('DigitalCredential', undefined);
    expect(_captureDcApiContext({requests}).protocolSupport).to.eql([
      {protocol: 'openid4vp-v1-signed', allowed: null},
      {protocol: 'org-iso-mdoc', allowed: null}
    ]);
    expect(_captureDcApiContext({requests}).digitalCredentialDefined)
      .to.be(false);

    setGlobal('DigitalCredential', {
      userAgentAllowsProtocol: () => {
        throw new Error('boom');
      }
    });
    expect(_captureDcApiContext({requests}).protocolSupport[0].allowed)
      .to.be(null);
  });

  it('omits fields whose browser API is missing instead of throwing', () => {
    setGlobal('navigator', {});
    setGlobal('document', undefined);
    setGlobal('window', undefined);
    setGlobal('DigitalCredential', undefined);
    const context = _captureDcApiContext({requests: []});
    expect(context).to.eql({
      digitalCredentialDefined: false,
      protocolSupport: []
    });
  });
});
