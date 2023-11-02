import * as sinon from 'sinon';
import {describe, it} from 'mocha';
import expect from 'expect.js';
import request from 'supertest';

import {app} from '../app.js';
import {exchanges} from '../common/database.js';
import {relyingParties} from '../config/config.js';

const testRP = {
  workflow: {
    type: 'native',
    id: 'testworkflow'
  },
  client_id: 'test',
  client_secret: 'shhh',
  domain: 'http://localhost:8080',
  redirect_uri: 'https://example.com',
  scopes: [{name: 'openid'}],
  credential_context: 'https://example.com',
  credential_type: 'Credential',
  credential_issuer: 'https://example.com',
};
const testEx = {
  id: 'abc123456',
  sequence: 0,
  ttl: 900,
  state: 'pending',
  variables: {},
  step: 'waiting',
  challenge: 'parkour',
  workflowId: testRP.workflow.id,
  accessToken: 'opensesame2023'
};

describe('OpenCred API - Native Workflow', function() {
  this.beforeEach(() => {
    this.originalRPs = [...relyingParties];
    relyingParties.splice(0, 1, ...[testRP]);
  });

  this.afterEach(() => {
    relyingParties.splice(0, this.originalRPs.length, ...this.originalRPs);
  });

  it('should return 404 for unknown workflow id', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves(
      testEx
    );
    const response = await request(app)
      .post(`/workflows/not-the-${testRP.workflow.id}/exchanges`)
      .send({

      })
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(404);
    expect(response.body.message).to.equal('Unknown workflow id');
    findStub.restore();
  });

  it('should create a new exchange with the workflow', async function() {
    const insertStub = sinon.stub(exchanges, 'insertOne').resolves();
    const response = await request(app)
      .post(`/workflows/${testRP.workflow.id}/exchanges`)
      .set(
        'Authorization', `Basic ${Buffer.from('test:shhh').toString('base64')}`
      )
      .send()
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.exchangeId).to.not.be(undefined);
    expect(response.body.vcapi).to.not.be(undefined);
    insertStub.restore();
  });

  it('should return status on exchange', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves(
      testEx
    );
    const response = await request(app)
      .get(`/workflows/${testRP.workflow.id}/exchanges/${testEx.id}`)
      .set(
        'Authorization', `Basic ${Buffer.from('test:shhh').toString('base64')}`
      );

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.exchange.id).to.equal(testEx.id);
    findStub.restore();
  });
});
