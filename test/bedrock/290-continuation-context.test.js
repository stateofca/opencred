/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import expect from 'expect.js';

import {baseUrl} from '../mock-data.js';
import {
  buildExchangeResultToken
} from '../../lib/workflows/common.js';
import {config} from '@bedrock/core';
import {database} from '../../lib/database.js';
import {exampleKey} from '../fixtures/signingKeys.js';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

const exampleWorkflow = {
  clientId: 'test',
  clientSecret: 'testsecret',
  type: 'native',
  query: [{
    type: ['VerifiableCredential']
  }],
  oidc: {
    redirectUri: 'https://example.com',
    idTokenExpirySeconds: 3600,
    claims: [{name: 'name', path: 'name'}]
  },
  brand: {cta: '#8A2BE2', primary: '#6A5ACD', header: '#9370DB'}
};

describe('continuationContext', () => {
  let signingKeysStub;
  let workflowStub;

  before(() => {
    signingKeysStub = sinon.stub(config.opencred, 'signingKeys')
      .value([{...exampleKey, purpose: ['id_token']}]);
    workflowStub = sinon.stub(config.opencred, 'workflows').value(
      [exampleWorkflow]
    );
  });

  after(() => {
    signingKeysStub?.restore();
    workflowStub?.restore();
  });

  it('should return 400 when exchange_token is missing', async () => {
    let err;
    try {
      await client.get(`${baseUrl}/context/continue`);
    } catch(e) {
      err = e;
    }
    expect(err).to.be.an(Error);
    expect(err.status).to.equal(400);
    expect(err.data?.message).to.contain('exchange_token');
  });

  it('should return 401 when exchange_token is invalid', async () => {
    let err;
    try {
      await client.get(
        `${baseUrl}/context/continue?exchange_token=invalid.jwt.token`
      );
    } catch(e) {
      err = e;
    }
    expect(err).to.be.an(Error);
    expect(err.status).to.equal(401);
    expect(err.data?.message).to.contain('Invalid or expired');
  });

  it('should return 404 when exchange does not exist', async () => {
    const token = await buildExchangeResultToken({
      exchangeId: 'nonexistent-exchange',
      workflowId: 'test',
      procedurePath: 'login'
    });
    let err;
    try {
      await client.get(
        `${baseUrl}/context/continue?exchange_token=${
          encodeURIComponent(token)}`
      );
    } catch(e) {
      err = e;
    }
    expect(err).to.be.an(Error);
    expect(err.status).to.equal(404);
  });

  it('should return context with autoRedirectToClient false when token valid',
    async () => {
      const exchangeId = 'ex-continuation-test';
      await database.collections.Exchanges.insertOne({
        id: exchangeId,
        workflowId: 'test',
        state: 'complete',
        step: 'default',
        sequence: 1,
        ttl: 3600,
        createdAt: new Date(),
        variables: {procedurePath: 'login'},
        oidc: {code: 'code', state: 'state'}
      });

      const token = await buildExchangeResultToken({
        exchangeId,
        workflowId: 'test',
        procedurePath: 'login'
      });

      const res = await client.get(
        `${baseUrl}/context/continue?exchange_token=${
          encodeURIComponent(token)}`
      );

      expect(res.status).to.equal(200);
      expect(res.data).to.have.property('workflow');
      expect(res.data).to.have.property('options');
      expect(res.data).to.have.property('exchangeData');
      expect(res.data.autoRedirectToClient).to.equal(false);
      expect(res.data.workflow.clientId).to.equal('test');
      expect(res.data.exchangeData.id).to.equal(exchangeId);

      await database.collections.Exchanges.deleteOne({id: exchangeId});
    });
});
