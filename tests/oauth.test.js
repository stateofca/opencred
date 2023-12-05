import {describe, it} from 'mocha';
import {importSPKI, jwtVerify} from 'jose';
import {exchanges} from '../common/database.js';

import * as sinon from 'sinon';
import expect from 'expect.js';
import request from 'supertest';

import {app} from '../app.js';
import {config} from '../config/config.js';

const exampleRelyingParty = {
  workflow: {
    id: 'testWorkflowId',
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
  type: 'RS256',
  id: 'example-key',
  privateKeyPem: `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDDhVw2YPUExQJI
ekl7sxN73Y4F0n9/tVKoEVOZ8b2NcRbjpYBnvyMudQEvRDnyUu40drW3ZPAlPILN
zxdSQDeLDmypdJ8OAPuR4Sc6HTaktNmjzKYNnPfGlosdgxr0eORXb31JDaC+oeJs
84CojLvb54mQXI7rKlMfo3KzWQZXHq7ATKTtZ1UaZJULFvipMWtMzVoGhrOrnIhH
J7J7D1T1oKdfnJcDE9Gu4a3E9lmqFuecpGjnKr2hdLjyd4qlQXeNGuNI1Grwpxbq
8XLa8kfNn2GKrGVZWWLh3BD5/H/E/Um2eF5P+S4LQTevP4SVsIhlIDGLEjEvzdYq
nWj5/yaDAgMBAAECggEBAISvbQuuMrkA5XLAIjwjI9bMXQRQfJvzNlu+Hmj7Z7Kk
C2+Dsic1zC9L0fj8qQJtCyBpaxpBEsOCVBZNMrtrvwXMTSuWbBY5zn+KN2+1wY52
+LezOwFEA9Yt9cyaW2GK5RL9Ix2/dNXJ0Ho1qZs4nog2keF5HrgyqeRvrHhPswDN
LiWmwO+fEO7CaMfFC3hRJOdxGAdYbEd6FhGuzPzJZabNBOHpZPAaMbyD4uLLWiNL
CPSL3E/0tYC66cqfUGaaXRTxtbzuiFJjcr+oRnTlSorlVxCVg9v+pJpoRsG6wdXD
yn9/Y8uyQ6nTw0xh+gUWWqKmU2JP4cGOGTs3yyF4mLECgYEA8aOUdHPv+SQjKhH1
1h1uw9pH24tizNiPtdcAcDxt4eyphEgHuCqL6AK6sdnL6yoneaCHJ7ZdFNKZ+Kr0
nP4iUV98OyBMvJDA7f23Lg96tAPRBD7hBP8dtNednO779+KpvV0JC2dnhAM778Eg
5oOBC/O+spKf70MogrLj/FxQsYsCgYEAzyQd1+veGfVZkS5FLYss677EGY7LZh6w
KfLT6cVZP7CikjUImjPAfWcpm0PWEku1rv74Z8BdXLRxgS2zY2kRL9Fbetw+XW7/
nL/IlJnxjRNf8NRjQ6fZuFZYZRPFdYN4C7khNPiGP3UqDMNQ6s3yCUOzfB+TCayA
VUvYihjMjekCgYEAvBO4fxOmWuL3w80K7ccm6aZCe+13zz1YTg60tqcyV8DfCKkP
6RakosdNDRUalUXQR+jcidp1hLmPQm+9yVw81d1eUp8HW1XH9PWf2GgP94Fo9McE
WeE/+/w/H2EcGYsA1vVNDuVDOwtRYYGO3BzLGsRzT4a0mYRKScB3l3s7C5UCgYEA
jz3ihVZOmJTaA1OD8yKzRbL92M6uSUgfemK5uIcIWMrFIWYbNMdk7VNRqlUWzEAe
u40GKnkUFu+RLkt0KeKWSAL2x9dWKTaA/NyC0IBEUdJ8HgZBPp/sJ1VOe1dYzRLF
CRZUqFTUQT28fmbype0U2uM+Uy9iduYbOODiNV1A10ECgYADlmAxLX74Tay0JX4C
57CZzcgoZHQsdH8sSa5noZLp30SxeHaLfZsWv4qB2wWFqkfULwXWjtR28jFVYzvj
twpE2n4U47ieMFI0zkfY+AwMmmenkwm3Ken4fwOx0iU/o5a6vtKT4umYPzXWMkLe
Bdhx5w4eksSbrwLu9q5ZoiPC6w==
-----END PRIVATE KEY-----`,
  publicKeyPem: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw4VcNmD1BMUCSHpJe7MT
e92OBdJ/f7VSqBFTmfG9jXEW46WAZ78jLnUBL0Q58lLuNHa1t2TwJTyCzc8XUkA3
iw5sqXSfDgD7keEnOh02pLTZo8ymDZz3xpaLHYMa9HjkV299SQ2gvqHibPOAqIy7
2+eJkFyO6ypTH6Nys1kGVx6uwEyk7WdVGmSVCxb4qTFrTM1aBoazq5yIRyeyew9U
9aCnX5yXAxPRruGtxPZZqhbnnKRo5yq9oXS48neKpUF3jRrjSNRq8KcW6vFy2vJH
zZ9hiqxlWVli4dwQ+fx/xP1JtnheT/kuC0E3rz+ElbCIZSAxixIxL83WKp1o+f8m
gwIDAQAB
-----END PUBLIC KEY-----`,
  purpose: ['id_token']
};

const exampleKey2 = {
  type: 'ES256',
  id: 'example-key-2',
  privateKeyPem: `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgQOoiBgmueLfufGgB
uUgIAANl9SvL52DFIRwwLjWdNNuhRANCAAQdKDqJPHPl7XKKvN1ne1fJ70UcnYtD
MjCUYHTzElFFxXNut27DnTeuJ7mOdJojJa2f1n1QibkZZ2d3lzr92WJn
-----END PRIVATE KEY-----`,
  publicKeyPem: `-----BEGIN PUBLIC KEY-----
  MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEHSg6iTxz5e1yirzdZ3tXye9FHJ2L
  QzIwlGB08xJRRcVzbrduw503rie5jnSaIyWtn9Z9UIm5GWdnd5c6/dliZw==
  -----END PUBLIC KEY-----`,
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

  it('should fail for unregistered client ids', async function() {
    const response = await request(app)
      .get('/login?client_id=unknown')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(400);
    expect(response.body.message).to.equal('Unknown client_id');
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
      response.text.includes('openid4vp://?'))
      .to.be(true);

    dbStub.restore();
  });

  it('should enable code for valid token exchange (RS256)',
    async function() {
      const dbStub = sinon.stub(exchanges, 'findOne');
      dbStub.resolves({
        _id: 'test',
        ttl: 900,
        workflowId: 'testWorkflowId',
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

      // Verify jwt
      const key = await importSPKI(exampleKey.publicKeyPem, 'ES256');
      const {payload, protectedHeader} = await jwtVerify(
        response.body.id_token,
        key
      );
      expect(payload.name).to.be('Alice');
      expect(protectedHeader.alg).to.be('RS256');
      expect(protectedHeader.kid).to.be('example-key');

      keysStub.restore();
      updateStub.restore();
      dbStub.restore();
    });

  it.skip('should enable code for valid token exchange (ES256)',
    async function() {
      const dbStub = sinon.stub(exchanges, 'findOne');
      dbStub.resolves({
        _id: 'test',
        ttl: 900,
        workflowId: 'testWorkflowId',
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
        exampleKey2
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

      // Verify jwt
      const key = await importSPKI(exampleKey2.publicKeyPem, 'ES256');
      const {payload, protectedHeader} = await jwtVerify(
        response.body.id_token,
        key
      );
      expect(payload.name).to.be('Alice');
      expect(protectedHeader.alg).to.be('RS256');
      expect(protectedHeader.kid).to.be('example-key');

      keysStub.restore();
      updateStub.restore();
      dbStub.restore();
    });

  it('should fail for the wrong client info', async function() {
    const dbStub = sinon.stub(exchanges, 'findOne');
    dbStub.resolves({
      _id: 'test',
      ttl: 900,
      workflowId: 'WRONG',
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
      'Invalid code or client_id'
    );

    dbStub.restore();
  });

  it('should fail to be exchanged twice', async function() {
    const dbStub = sinon.stub(exchanges, 'findOne');
    dbStub.onCall(0).resolves({
      _id: 'test',
      ttl: 900,
      workflowId: 'testWorkflowId',
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

  it('should allow client_secret_basic auth', async function() {
    const dbStub = sinon.stub(exchanges, 'findOne');
    dbStub.resolves({
      _id: 'test',
      ttl: 900,
      workflowId: 'testWorkflowId',
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
      .set(
        'Authorization',
        `Basic ${Buffer.from('test:testsecret').toString('base64')}`
      )
      .send(
        'grant_type=authorization_code&code=the-code' +
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

  it('Should not yield a token if exchange isn\'t complete', async function() {
    const dbStub = sinon.stub(exchanges, 'findOne');
    dbStub.resolves({
      _id: 'test',
      ttl: 900,
      workflowId: 'testWorkflowId',
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
