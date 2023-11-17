import {describe, it} from 'mocha';
import {exchanges} from '../common/database.js';

import * as sinon from 'sinon';
import expect from 'expect.js';
import request from 'supertest';

import {app} from '../app.js';
import {config} from '../config/config.js';

const exampleRelyingParty = {
  workflow: {
    type: 'native',
    initialStep: 'default',
    steps: {
      default: {
        verifiablePresentationRequest: {}
      }
    }
  },
  clientId: 'test',
  clientSecret: 'testsecret',
  redirectUri: 'https://example.com',
  scopes: [{name: 'openid'}],
  theme: {
    cta: '#8A2BE2',
    primary: '#6A5ACD',
    header: '#9370DB',
  },
  claims: [
    {
      name: 'name',
      path: 'name'
    }
  ]
};

const exampleKey = {
  type: 'ES256',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\n' +
    'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgwLbkoZh3wYp0p83Z\n' +
    'vlsqUhoT5Tmb/C2noUIQIRGA57ahRANCAARfPqGvN6FfB3Ke1RPSB6GQz2dd+ELC\n' +
    'h0bvoXioeqXrMR/RvZ+JRuQ5nMfh3UC7As2Ve4hq6JAUa2+VsxC2z2fd\n' +
    '-----END PRIVATE KEY-----',
  publicKeyPem: '-----BEGIN PUBLIC KEY-----\n' +
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEXz6hrzehXwdyntUT0gehkM9nXfhC\n' +
    'wodG76F4qHql6zEf0b2fiUbkOZzH4d1AuwLNlXuIauiQFGtvlbMQts9n3Q==\n' +
    '-----END PUBLIC KEY-----',
  purpose: ['id_token']
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
    expect(response.body.error_description).to.equal('Unknown redirect_uri');

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
    expect(response.body.error).to.equal('invalid_scope');
    expect(response.body.error_description).to.equal(
      'scope must be "openid"'
    );

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

  it('should enable code for token exchange', async function() {
    const dbStub = sinon.stub(exchanges, 'findOne');
    dbStub.resolves({
      _id: 'test',
      ttl: 900,
      clientId: 'test',
      code: 'the-code',
      variables: {
        results: {
          default: {
            verifiablePresentation: {
              type: 'VerifiablePresentation',
              verifiableCredential: [{
                type: 'VerifiableCredential',
                credentialSubject: {
                  id: 'did:example:123',
                  name: 'Alice'
                }
              }]
            }
          }
        }
      },
      step: 'default',
      redirectUri: 'https://example.com',
      state: 'complete',
      scope: 'openid'
    });
    const updateStub = sinon.stub(exchanges, 'updateOne');
    updateStub.resolves(undefined);

    const keysStub = sinon.stub(config, 'signingKeys').value([
      exampleKey
    ]);

    const response = await request(app)
      .post('/token')
      .set('Accept', 'application/json')
      .send(
        'client_id=test&client_secret=testsecret' +
        '&grant_type=authorization_code&code=the-code' +
        '&redirect_uri=https%3A%2F%2Fexample.com' +
        '&scope=openid'
      );
    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.id_token).to.not.be(undefined);
    expect(response.body.token_type).to.equal('Bearer');

    // Bearer token is included for OAuth2 compliance, but is not used.
    expect(response.body.access_token).to.equal('NONE');

    keysStub.restore();
    updateStub.restore();
    dbStub.restore();
  });

  it('should fail to be exchanged twice', async function() {
    const dbStub = sinon.stub(exchanges, 'findOne');
    dbStub.onCall(0).resolves({
      _id: 'test',
      ttl: 900,
      clientId: 'test',
      code: 'the-code',
      variables: {
        results: {
          default: {
            verifiablePresentation: {
              type: 'VerifiablePresentation',
              verifiableCredential: [{
                type: 'VerifiableCredential',
                credentialSubject: {
                  id: 'did:example:123',
                  name: 'Alice'
                }
              }]
            }
          }
        }
      },
      step: 'default',
      redirectUri: 'https://example.com',
      state: 'complete',
      scope: 'openid'
    });
    dbStub.onCall(1).resolves(undefined);
    const updateStub = sinon.stub(exchanges, 'updateOne');
    updateStub.resolves(undefined);

    const keysStub = sinon.stub(config, 'signingKeys').value([
      exampleKey
    ]);

    const requestBody = 'client_id=test&client_secret=testsecret' +
    '&grant_type=authorization_code&code=the-code' +
    '&redirect_uri=https%3A%2F%2Fexample.com' +
    '&scope=openid';
    const response = await request(app)
      .post('/token')
      .set('Accept', 'application/json')
      .send(requestBody);
    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);

    const response2 = await request(app)
      .post('/token')
      .set('Accept', 'application/json')
      .send(requestBody);
    expect(response2.headers['content-type']).to.match(/json/);
    expect(response2.status).to.equal(400);
    expect(response2.body.error).to.equal('invalid_grant');
    expect(response2.body.error_description).to.equal('Invalid code');

    keysStub.restore();
    dbStub.restore();
    updateStub.restore();
  });

  it('Should not yield a token if exchange isn\'t complete', async function() {
    const dbStub = sinon.stub(exchanges, 'findOne');
    dbStub.resolves({
      _id: 'test',
      ttl: 900,
      clientId: 'test',
      code: 'the-code',
      step: 'default',
      redirectUri: 'https://example.com',
      state: 'invalid',
      scope: 'openid'
    });

    const response = await request(app)
      .post('/token')
      .set('Accept', 'application/json')
      .send(
        'client_id=test&client_secret=testsecret' +
        '&grant_type=authorization_code&code=the-code' +
        '&redirect_uri=https%3A%2F%2Fexample.com' +
        '&scope=openid'
      );
    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(400);
    expect(response.body.error).to.equal('invalid_grant');
    expect(response.body.error_description).to.equal(
      'Invalid code: Exchange status invalid'
    );

    dbStub.restore();
  });
});

describe('JWKS Endpoint', function() {
  it('should return an empty set if no keys are configured', async function() {
    const signingKeyStub = sinon.stub(config, 'signingKeys').value([]);

    const response = await request(app)
      .get('/.well-known/jwks.json')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.keys).to.be.an(Array);
    expect(response.body.keys.length).to.equal(0);

    signingKeyStub.restore();
  });

  it('should return a key if configured', async function() {
    const signingKeyStub = sinon.stub(config, 'signingKeys').value(
      [exampleKey]
    );

    const response = await request(app)
      .get('/.well-known/jwks.json')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.keys).to.be.an(Array);
    expect(response.body.keys.length).to.equal(1);
    expect(response.body.keys[0].kid).to.not.be(undefined);

    signingKeyStub.restore();
  });
});

describe('Open ID Connect Configuration Endpoint', function() {
  this.beforeEach(() => {
    this.signingKeyStub = sinon.stub(config, 'signingKeys').value([]);
  });

  this.afterEach(() => {
    this.signingKeyStub.restore();
  });

  it('should return Open ID service discovery info', async function() {
    const response = await request(app)
      .get('/.well-known/openid-configuration')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.issuer).to.equal(config.domain);
  });

  it('should report what languages are available', async function() {
    const translationsStub = sinon.stub(config, 'translations').value({
      en: {},
      fr: {},
      de: {}
    });
    const response = await request(app)
      .get('/.well-known/openid-configuration')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.ui_locales_supported).to.be.an(Array);
    expect(response.body.ui_locales_supported.length).to.equal(3);
    expect(response.body.ui_locales_supported).to.contain('en');

    translationsStub.restore();
  });
});
