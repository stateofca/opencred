/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {importSPKI, jwtVerify} from 'jose';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';

import {exampleKey, exampleKey2} from '../fixtures/signingKeys.js';
import {baseUrl} from '../mock-data.js';
import {config} from '@bedrock/core';
import {database} from '../../lib/database.js';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

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
  idTokenExpirySeconds: 3600,
  clientSecret: 'testsecret',
  redirectUri: 'https://example.com',
  scopes: [{name: 'openid'}],
  brand: {
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

describe('OAuth Login Workflow', function() {
  this.beforeEach(() => {
    this.rpStub = sinon.stub(config.opencred, 'relyingParties').value(
      [exampleRelyingParty]
    );
  });

  this.afterEach(() => {
    this.rpStub.restore();
  });

  it('should fail for unregistered client ids', async function() {
    let result;
    let err;
    try {
      result = await client.get(`${baseUrl}/context/login?client_id=unknown`);
    } catch(e) {
      err = e;
    }

    should.not.exist(result);
    err.status.should.be.equal(400);
    err.data.message.should.be.equal('Unknown client_id');
  });

  it('should fail for unregistered redirectUri', async function() {
    const dbStub = sinon.stub(database.collections.Exchanges, 'insertOne');
    dbStub.resolves({insertedId: 'test'});

    let result;
    let err;
    try {
      result = await client.get(`${baseUrl}/context/login?client_id=test&` +
        `redirect_uri=https%3A%2F%2Fexample.com%2FNOT`);
    } catch(e) {
      err = e;
    }

    should.not.exist(result);
    err.status.should.be.equal(400);
    err.data.error_description.should.be.equal('Unknown redirect_uri');

    dbStub.restore();
  });

  it('should fail for unregistered client ids', async function() {
    let result;
    let err;
    try {
      result = await client.get(`${baseUrl}/context/login?client_id=unknown`);
    } catch(e) {
      err = e;
    }

    should.not.exist(result);
    err.status.should.be.equal(400);
    err.data.message.should.be.equal('Unknown client_id');
  });

  it('should fail for incorrect scopes', async function() {
    const dbStub = sinon.stub(database.collections.Exchanges, 'insertOne');
    dbStub.resolves({insertedId: 'test'});

    let result;
    let err;
    try {
      result = await client.get(`${baseUrl}/context/login?client_id=test` +
        `&redirect_uri=https%3A%2F%2Fexample.com&scope=NOT`
      );
    } catch(e) {
      err = e;
    }

    should.not.exist(result);
    err.status.should.be.equal(400);
    err.data.error.should.be.equal('invalid_scope');
    err.data.error_description.should.be.equal('scope must be "openid"');

    dbStub.restore();
  });

  it('should return mocked exchange metadata', async function() {
    const dbStub = sinon.stub(database.collections.Exchanges, 'insertOne');
    dbStub.resolves({insertedId: 'test'});

    let result;
    let err;
    try {
      result = await client.get(`${baseUrl}/context/login?client_id=test` +
        `&redirect_uri=https%3A%2F%2Fexample.com&scope=openid`);
    } catch(e) {
      err = e;
    }

    should.not.exist(err);
    result.status.should.be.equal(200);
    result.data.exchangeData.OID4VP.should.have.string('openid4vp://?');
    result.data.exchangeData.id.should.be.a('string');

    dbStub.restore();
  });

  it('should enable code for valid token exchange (RS256)',
    async function() {
      const dbStub = sinon.stub(database.collections.Exchanges, 'findOne');
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
      const updateStub = sinon.stub(
        database.collections.Exchanges,
        'updateOne'
      );
      updateStub.resolves(undefined);
      const keysStub = sinon.stub(config.opencred, 'signingKeys').value([
        exampleKey
      ]);

      let result;
      let err;
      try {
        result = await client.post(`${baseUrl}/token`, {
          headers: {'content-type': 'application/x-www-form-urlencoded'},
          body: 'client_id=test&client_secret=testsecret' +
                '&grant_type=authorization_code&code=the-code' +
                '&redirect_uri=https%3A%2F%2Fexample.com' +
                '&scope=openid'});
      } catch(e) {
        err = e;
      }

      should.not.exist(err);
      result.status.should.be.equal(200);
      should.exist(result.data.id_token);
      result.data.token_type.should.be.equal('Bearer');

      // Bearer token is included for OAuth2 compliance, but is not used.
      result.data.access_token.should.equal('NONE');

      // Verify jwt
      const key = await importSPKI(exampleKey.publicKeyPem, 'ES256');
      const {payload, protectedHeader} = await jwtVerify(
        result.data.id_token,
        key
      );
      payload.name.should.be.equal('Alice');
      protectedHeader.alg.should.be.equal('RS256');
      protectedHeader.kid.should.be.equal('example-key');

      keysStub.restore();
      updateStub.restore();
      dbStub.restore();
    });

  it.skip('should enable code for valid token exchange (ES256)',
    async function() {
      const dbStub = sinon.stub(database.collections.Exchanges, 'findOne');
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
      const updateStub = sinon.stub(
        database.collections.Exchanges,
        'updateOne'
      );
      updateStub.resolves(undefined);

      const keysStub = sinon.stub(config.opencred, 'signingKeys').value([
        exampleKey2
      ]);

      let result;
      let err;
      try {
        result = await client.post(`${baseUrl}/token`, {body:
          'client_id=test&client_secret=testsecret' +
          '&grant_type=authorization_code&code=the-code' +
          '&redirect_uri=https%3A%2F%2Fexample.com' +
          '&scope=openid'});
      } catch(e) {
        err = e;
      }

      should.not.exist(err);
      result.status.should.be.equal(200);
      result.data.id_token.should.be.a('string');
      result.data.id_token.should.be.a('string');
      result.data.token_type.should.be.equal('Bearer');

      // Bearer token is included for OAuth2 compliance, but is not used.
      result.data.access_token.should.be.equal('NONE');

      // Verify jwt
      const key = await importSPKI(exampleKey2.publicKeyPem, 'ES256');
      const {payload, protectedHeader} = await jwtVerify(
        result.data.id_token,
        key
      );
      payload.name.should.be.equal('Alice');
      protectedHeader.alg.should.be.equal('RS256');
      protectedHeader.kid.should.be.equal('example-key');

      keysStub.restore();
      updateStub.restore();
      dbStub.restore();
    });

  it('should fail for the wrong client info', async function() {
    const dbStub = sinon.stub(database.collections.Exchanges, 'findOne');
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

    let result;
    let err;
    try {
      result = await client.post(`${baseUrl}/token`, {
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: 'client_id=test&client_secret=testsecret' +
              '&grant_type=authorization_code&code=the-code' +
              '&redirect_uri=https%3A%2F%2Fexample.com' +
              '&scope=openid'
      });
    } catch(e) {
      err = e;
    }

    should.not.exist(result);
    err.status.should.be.equal(400);
    err.data.error.should.be.equal('invalid_grant');
    err.data.error_description.should.be.equal('Invalid code or client_id');

    dbStub.restore();
  });

  it('should fail to be exchanged twice', async function() {
    const dbStub = sinon.stub(database.collections.Exchanges, 'findOne');
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
    const updateStub = sinon.stub(database.collections.Exchanges, 'updateOne');
    updateStub.resolves(undefined);

    const keysStub = sinon.stub(config.opencred, 'signingKeys').value([
      exampleKey
    ]);

    const requestBody = 'client_id=test&client_secret=testsecret' +
      '&grant_type=authorization_code&code=the-code' +
      '&redirect_uri=https%3A%2F%2Fexample.com' +
      '&scope=openid';
    let result;
    let err;
    try {
      result = await client.post(`${baseUrl}/token`, {
        body: requestBody,
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        }});
    } catch(e) {
      err = e;
    }

    should.not.exist(err);
    result.status.should.be.equal(200);

    let result2;
    let err2;
    try {
      result2 = await client.post(`${baseUrl}/token`, {
        body: requestBody,
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        }
      });
    } catch(e) {
      err2 = e;
    }

    should.not.exist(result2);
    err2.status.should.be.equal(400);
    err2.data.error.should.be.equal('invalid_grant');
    err2.data.error_description.should.be.equal('Invalid code');

    keysStub.restore();
    dbStub.restore();
    updateStub.restore();
  });

  it('should allow client_secret_basic auth', async function() {
    const dbStub = sinon.stub(database.collections.Exchanges, 'findOne');
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
    const updateStub = sinon.stub(database.collections.Exchanges, 'updateOne');
    updateStub.resolves(undefined);

    const keysStub = sinon.stub(config.opencred, 'signingKeys').value([
      exampleKey
    ]);

    let result;
    let err;
    try {
      const basic = Buffer.from('test:testsecret').toString('base64');
      result = await client.post(`${baseUrl}/token`, {
        headers: {
          Authorization: `Basic ${basic}`,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=authorization_code&code=the-code' +
              '&redirect_uri=https%3A%2F%2Fexample.com' +
              '&scope=openid'
      });
    } catch(e) {
      err = e;
    }

    should.not.exist(err);
    result.status.should.be.equal(200);
    result.data.id_token.should.be.a('string');
    result.data.token_type.should.be.equal('Bearer');

    // Bearer token is included for OAuth2 compliance, but is not used.
    result.data.access_token.should.be.equal('NONE');

    keysStub.restore();
    updateStub.restore();
    dbStub.restore();
  });

  it('Should not yield a token if exchange isn\'t complete', async function() {
    const dbStub = sinon.stub(database.collections.Exchanges, 'findOne');
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

    let result;
    let err;
    try {
      result = await client.post(`${baseUrl}/token`, {
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body:
        'client_id=test&client_secret=testsecret' +
        '&grant_type=authorization_code&code=the-code' +
        '&redirect_uri=https%3A%2F%2Fexample.com' +
        '&scope=openid'
      });
    } catch(e) {
      err = e;
    }

    should.not.exist(result);
    err.status.should.be.equal(400);
    err.data.error.should.be.equal('invalid_grant');
    err.data.error_description.should.be.equal(
      'Invalid code: Exchange status invalid'
    );

    dbStub.restore();
  });
});

describe('JWKS Endpoint', function() {
  it('should return an empty set if no keys are configured', async function() {
    const signingKeyStub = sinon.stub(config.opencred, 'signingKeys').value([]);

    let result;
    let err;
    try {
      result = await client.get(`${baseUrl}/.well-known/jwks.json`);
    } catch(e) {
      err = e;
    }

    should.not.exist(err);
    result.status.should.be.equal(200);
    result.data.keys.length.should.be.equal(0);

    signingKeyStub.restore();
  });

  it('should return a key if configured', async function() {
    const signingKeyStub = sinon.stub(config.opencred, 'signingKeys').value(
      [exampleKey]
    );

    let result;
    let err;
    try {
      result = await client.get(`${baseUrl}/.well-known/jwks.json`);
    } catch(e) {
      err = e;
    }

    should.not.exist(err);
    result.status.should.be.equal(200);
    result.data.keys.length.should.be.equal(1);
    should.exist(result.data.keys[0].kid);

    signingKeyStub.restore();
  });
});

describe('Open ID Connect Configuration Endpoint', function() {
  this.beforeEach(() => {
    this.signingKeyStub = sinon.stub(config.opencred, 'signingKeys').value([]);
  });

  this.afterEach(() => {
    this.signingKeyStub.restore();
  });

  it('should return Open ID service discovery info', async function() {
    let result;
    let err;
    try {
      result = await client.get(`${baseUrl}/.well-known/openid-configuration`);
    } catch(e) {
      err = e;
    }

    should.not.exist(err);
    result.status.should.be.equal(200);
    result.data.issuer.should.be.equal(config.server.baseUri);
  });

  it('should report what languages are available', async function() {
    const translationsStub = sinon.stub(config.opencred, 'translations').value({
      en: {},
      fr: {},
      de: {}
    });

    let result;
    let err;
    try {
      result = await client.get(`${baseUrl}/.well-known/openid-configuration`);
    } catch(e) {
      err = e;
    }

    should.not.exist(err);
    result.status.should.be.equal(200);
    result.data.ui_locales_supported.length.should.be.equal(3);
    result.data.ui_locales_supported.should.contain('en');

    translationsStub.restore();
  });
});
