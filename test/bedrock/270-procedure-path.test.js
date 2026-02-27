/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import expect from 'expect.js';

import {baseUrl} from '../mock-data.js';
import {config} from '@bedrock/core';
import {database} from '../../lib/database.js';
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

describe('procedurePath', function() {
  let insertStub;

  this.beforeAll(() => {
    this.rpStub = sinon.stub(config.opencred, 'workflows').value(
      [exampleWorkflow]
    );
  });

  this.afterAll(() => {
    this.rpStub.restore();
  });

  this.afterEach(() => {
    if(insertStub) {
      insertStub.restore();
      insertStub = null;
    }
  });

  it('should set procedurePath to login when exchange created via loginContext',
    async function() {
      let insertedDoc;
      insertStub = sinon.stub(database.collections.Exchanges, 'insertOne')
        .callsFake(doc => {
          insertedDoc = doc;
          return Promise.resolve({insertedId: 'test'});
        });

      let result;
      let err;
      try {
        result = await client.get(
          `${baseUrl}/context/login?client_id=test` +
          `&redirect_uri=https%3A%2F%2Fexample.com&scope=openid`);
      } catch(e) {
        err = e;
      }

      expect(err).to.be(undefined);
      expect(result.status).to.equal(200);
      expect(insertStub.called).to.be(true);
      expect(insertedDoc.variables.procedurePath).to.equal('login');
    });

  it('should set procedurePath to verification when exchange created via ' +
    'verificationContext', async function() {
    let insertedDoc;
    insertStub = sinon.stub(database.collections.Exchanges, 'insertOne')
      .callsFake(doc => {
        insertedDoc = doc;
        return Promise.resolve({insertedId: 'test'});
      });

    let result;
    let err;
    try {
      result = await client.get(
        `${baseUrl}/context/verification?client_id=test` +
        `&redirect_uri=https%3A%2F%2Fexample.com&scope=openid`);
    } catch(e) {
      err = e;
    }

    expect(err).to.be(undefined);
    expect(result.status).to.equal(200);
    expect(insertStub.called).to.be(true);
    expect(insertedDoc.variables.procedurePath).to.equal('verification');
  });

  it('should set procedurePath to verification when exchange created via ' +
    'VC API',
  async function() {
    let insertedDoc;
    insertStub = sinon.stub(database.collections.Exchanges, 'insertOne')
      .callsFake(doc => {
        insertedDoc = doc;
        return Promise.resolve({insertedId: 'test'});
      });

    const basic = Buffer.from('test:testsecret').toString('base64');
    let result;
    let err;
    try {
      result = await client.post(
        `${baseUrl}/workflows/test/exchanges`,
        {headers: {Authorization: `Basic ${basic}`}}
      );
    } catch(e) {
      err = e;
    }

    expect(err).to.be(undefined);
    expect(result.status).to.equal(200);
    expect(insertStub.called).to.be(true);
    expect(insertedDoc.variables.procedurePath).to.equal('verification');
  });
});
