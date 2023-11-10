import {describe, it} from 'mocha';
import {exchanges} from '../common/database.js';

import * as sinon from 'sinon';
import expect from 'expect.js';
import request from 'supertest';

import {app} from '../app.js';
import {config} from '../config/config.js';

const exampleRelyingParty = {
  workflow: {
    type: 'native'
  },
  clientId: 'test',
  clientSecret: 'testsecret',
  redirectUri: 'https://example.com',
  scopes: [{name: 'openid'}],
  theme: {
    cta: '#8A2BE2',
    primary: '#6A5ACD',
    header: '#9370DB',
  }
};

describe('OAuth Login Workflow', function() {
  this.beforeEach(() => {
    this.rpStub = sinon.stub(config, 'relyingParties').value(
      [exampleRelyingParty]
    );
  });

  this.afterEach(() => {
    this.rpStub.restore();
  });

  it('should fail for unregistered client ids', async function() {
    const response = await request(app)
      .get('/login?client_id=unknown')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(400);
    expect(response.body.message).to.equal('Unknown client_id');
  });

  it('should fail for unregistered redirectUri', async function() {
    const dbStub = sinon.stub(exchanges, 'insertOne');
    dbStub.resolves({insertedId: 'test'});

    const response = await request(app)
      .get('/login?client_id=test&redirect_uri=https%3A%2F%2Fexample.com%2FNOT')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(400);
    expect(response.body.message).to.equal('Unknown redirect_uri');

    dbStub.restore();
  });

  it('should fail for incorrect scopes', async function() {
    const dbStub = sinon.stub(exchanges, 'insertOne');
    dbStub.resolves({insertedId: 'test'});

    const response = await request(app)
      .get('/login?client_id=test&redirect_uri=https%3A%2F%2F' +
        'example.com&scope=NOT')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(400);
    expect(response.body.message).to.equal('Invalid scope');

    dbStub.restore();
  });

  it('should return mocked exchange metadata', async function() {
    const dbStub = sinon.stub(exchanges, 'insertOne');
    dbStub.resolves({insertedId: 'test'});

    const response = await request(app)
      .get('/login?client_id=test&redirect_uri=https%3A%2F%2F' +
        'example.com&scope=openid')
      .set('Accept', 'text/html');

    expect(response.headers['content-type']).to.match(/text\/html/);
    expect(response.status).to.equal(200);
    expect(response.text).to.be.a('string');
    expect(
      response.text.includes('openid4vp://authorize?'))
      .to.be(true);

    dbStub.restore();
  });
});

