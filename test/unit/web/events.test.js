/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import expect from 'expect.js';

import {reportExchangeEvent} from '../../../web/utils/events.js';

const exchangeData = {
  id: 'exchange-1',
  workflowId: 'workflow-1',
  accessToken: 'token'
};

function mockHttpClient({postError} = {}) {
  const post = postError ?
    sinon.stub().rejects(postError) :
    sinon.stub().resolves({data: {}});
  return {post};
}

describe('reportExchangeEvent', () => {
  it('posts the event to the exchange events endpoint with bearer auth',
    async () => {
      const httpClient = mockHttpClient();

      await reportExchangeEvent({
        exchangeData,
        httpClient,
        type: 'interaction_picker_opened',
        payload: {method: 'dcapi'}
      });

      expect(httpClient.post.calledOnce).to.be(true);
      const [url, opts] = httpClient.post.firstCall.args;
      expect(url).to.equal(
        '/workflows/workflow-1/exchanges/exchange-1/events');
      expect(opts.json.type).to.equal('interaction_picker_opened');
      expect(opts.json.method).to.equal('dcapi');
      expect(opts.headers.Authorization).to.equal('Bearer token');
    });

  it('merges payload fields into the posted body (from/to method)',
    async () => {
      const httpClient = mockHttpClient();

      await reportExchangeEvent({
        exchangeData,
        httpClient,
        type: 'interaction_method_selected',
        payload: {fromMethod: 'dcapi', toMethod: 'qr-and-link'}
      });

      const [, opts] = httpClient.post.firstCall.args;
      expect(opts.json.type).to.equal('interaction_method_selected');
      expect(opts.json.fromMethod).to.equal('dcapi');
      expect(opts.json.toMethod).to.equal('qr-and-link');
    });

  it('posts with no payload fields when payload is omitted', async () => {
    const httpClient = mockHttpClient();

    await reportExchangeEvent({
      exchangeData,
      httpClient,
      type: 'interaction_picker_dismissed'
    });

    const [, opts] = httpClient.post.firstCall.args;
    expect(opts.json.type).to.equal('interaction_picker_dismissed');
    expect(opts.json).to.only.have.key('type');
  });

  it('is best-effort: a post failure never throws', async () => {
    const httpClient = mockHttpClient({postError: new Error('network down')});

    let thrown;
    try {
      await reportExchangeEvent({
        exchangeData,
        httpClient,
        type: 'interaction_picker_opened',
        payload: {method: 'dcapi'}
      });
    } catch(e) {
      thrown = e;
    }
    expect(thrown).to.be(undefined);
  });
});
