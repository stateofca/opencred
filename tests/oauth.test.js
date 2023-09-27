import {describe, it} from 'mocha';
import expect from 'expect.js';
import request from 'supertest';

import {app} from '../app.js';
import {relyingParties} from '../config/config.js';

const exampleRelyingParty = {
  client_id: 'test',
  client_secret: 'testsecret',
  redirect_uri: 'https://example.com',
  scopes: [{name: 'openid'}],
  credential_context: 'https://example.com',
  credential_type: 'Credential',
  credential_issuer: 'https://example.com',
};

describe('App', async () => {
  it('should fail for unregistered client ids', async function() {
    const response = await request(app)
      .get('/login?client_id=unknown')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(400);
    expect(response.body.message).to.equal('Unknown client_id');
  });

  it('should fail for unregistered redirect_uri', async function() {
    const originalRPs = [...relyingParties];
    relyingParties.splice(0, 1, ...[exampleRelyingParty]);

    const response = await request(app)
      .get('/login?client_id=test&redirect_uri=https%3A%2F%2Fexample.com%2FNOT')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(400);
    expect(response.body.message).to.equal('Unknown redirect_uri');

    relyingParties.splice(0, originalRPs.length, ...originalRPs);
  });

  it('should fail for incorrect scopes', async function() {
    const originalRPs = [...relyingParties];
    relyingParties.splice(0, 1, ...[exampleRelyingParty]);

    const response = await request(app)
      .get('/login?client_id=test&redirect_uri=https%3A%2F%2F' +
        'example.com&scope=NOT')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(400);
    expect(response.body.message).to.equal('Invalid scope');

    relyingParties.splice(0, originalRPs.length, ...originalRPs);
  });

  it('should return mocked exchange metadata', async function() {
    const originalRPs = [...relyingParties];
    relyingParties.splice(0, 1, ...[exampleRelyingParty]);

    const response = await request(app)
      .get('/login?client_id=test&redirect_uri=https%3A%2F%2F' +
        'example.com&scope=openid')
      .set('Accept', 'text/html');

    expect(response.headers['content-type']).to.match(/text\/html/);
    expect(response.status).to.equal(200);
    expect(response.text).to.be.a('string');
    expect(
      response.text.includes('openid-verification-request://'))
      .to.be(true);

    relyingParties.splice(0, originalRPs.length, ...originalRPs);
  });
});

