import * as sinon from 'sinon';
import {describe, it} from 'mocha';
import expect from 'expect.js';
import request from 'supertest';

import {app} from '../app.js';
import {config} from '../config/config.js';
import {exchanges} from '../common/database.js';
import {zcapClient} from '../common/zcap.js';

const testRP = {
  workflow: {
    type: 'native',
    id: 'testworkflow'
  },
  clientId: 'test',
  clientSecret: 'shhh',
  redirectUri: 'https://example.com',
  scopes: [{name: 'openid'}],
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
    this.rpStub = sinon.stub(config, 'relyingParties').value([testRP]);
  });

  this.afterEach(() => {
    this.rpStub.restore();
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
    expect(response.body.id).to.not.be(undefined);
    expect(response.body.vcapi).to.not.be(undefined);
    expect(insertStub.called).to.be(true);
    insertStub.restore();
  });

  it('should return status on exchange', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves(
      testEx
    );
    const response = await request(app)
      .get(`/workflows/${testRP.workflow.id}/exchanges/${testEx.id}`)
      .set(
        'Authorization', `Bearer ${testEx.accessToken}`
      );

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.exchange.id).to.equal(testEx.id);
    findStub.restore();
  });
});

describe('OpenCred API - VC-API Workflow', function() {
  this.beforeEach(() => {
    this.rpStub = sinon.stub(config, 'relyingParties').value([{
      ...testRP,
      workflow: {
        id: testRP.workflow.id,
        type: 'vc-api',
        capability: '{}',
        clientSecret: 'vcapiclientsecret',
        vpr: '{}'
      }
    }]);
  });

  this.afterEach(() => {
    this.rpStub.restore();
  });

  it('should create a new exchange with the workflow', async function() {
    const insertStub = sinon.stub(exchanges, 'insertOne').resolves();
    const zcapStub = sinon.stub(zcapClient, 'zcapWriteRequest').resolves({
      result: {
        headers: new Headers({location: 'https://someexchanges.com/123'}),
        status: 204
      }
    });
    const response = await request(app)
      .post(`/workflows/${testRP.workflow.id}/exchanges`)
      .set(
        'Authorization', `Basic ${Buffer.from('test:shhh').toString('base64')}`
      )
      .send()
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.id).to.not.be(undefined);
    expect(response.body.vcapi).to.not.be(undefined);
    expect(insertStub.called).to.be(true);
    expect(zcapStub.called).to.be(true);
    insertStub.restore();
    zcapStub.restore();
  });

  it('should return status on exchange', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves(
      testEx
    );
    const zcapStub = sinon.stub(zcapClient, 'zcapReadRequest')
      .resolves({data: testEx});
    const response = await request(app)
      .get(`/workflows/${testRP.workflow.id}/exchanges/${testEx.id}`)
      .set(
        'Authorization', `Bearer ${testEx.accessToken}`
      );

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.exchange.id).to.equal(testEx.id);
    findStub.restore();
    zcapStub.restore();
  });
});
