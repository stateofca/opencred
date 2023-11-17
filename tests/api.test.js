import * as sinon from 'sinon';
import {describe, it} from 'mocha';
import expect from 'expect.js';
import request from 'supertest';

import {app} from '../app.js';
import {config} from '../config/config.js';
import {exchanges} from '../common/database.js';
import {msalUtils} from '../common/utils.js';
import {zcapClient} from '../common/zcap.js';

const testRP = {
  workflow: {
    type: 'native',
    id: 'testworkflow',
    steps: {
      waiting: {
        verifiablePresentationRequest: '{}'
      }
    }
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
  accessToken: 'opensesame2023',
  createdAt: new Date()
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

  it('should allow POST to exchange endpoint', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves(testEx);
    // console.error(`/workflows/${testRP.workflow.id}/exchanges/${testEx.id}`)
    const response = await request(app)
      .post(`/workflows/${testRP.workflow.id}/exchanges/${testEx.id}`)
      .send()
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    findStub.restore();
  });

  it('should 404 on POST to exchange endpoint if expired', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves({
      ...testEx, createdAt: new Date(new Date().getTime() - 1000 * 1000)
    });
    const response = await request(app)
      .post(`/workflows/${testRP.workflow.id}/exchanges/${testEx.id}`)
      .send()
      .set('Accept', 'application/json');

    expect(response.status).to.equal(404);
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

describe('OpenCred API - Microsoft Entra Verified ID Workflow', function() {
  this.beforeEach(() => {
    this.rpStub = sinon.stub(config, 'relyingParties').value([{
      ...testRP,
      workflow: {
        id: testRP.workflow.id,
        type: 'microsoft-entra-verified-id',
        apiBaseUrl: 'https://api.entra.microsoft.example.com/v1.0',
        apiLoginBaseUrl: 'https://login.entra.microsoft.example.com',
        verifierDid: 'did:web:example.com',
        verifierName: 'Test Entra Verifier',
        acceptedCredentialType: 'Iso18013DriversLicenseCredential',
        credentialVerificationCallbackAuthEnabled: false
      }
    }]);
  });

  this.afterEach(() => {
    this.rpStub.restore();
  });

  it('should create a new exchange with the workflow', async function() {
    const insertStub = sinon.stub(exchanges, 'insertOne').resolves();
    const getMsalClientStub = sinon.stub(msalUtils, 'getMsalClient')
      .returns(null);
    const makeHttpPostRequestStub = sinon.stub(msalUtils, 'makeHttpPostRequest')
      .resolves({
        data: {
          requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
          url: 'openid://vc/?request_uri=https://requri.example.com/123',
          expiry: 1699635246762
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
    expect(response.body.id).to.equal('c656dad8-a8fa-4361-baef-51af0c2e428e');
    expect(response.body.vcapi).to.not.be(undefined);
    expect(response.body.accessToken).to.not.be(undefined);
    expect(response.body.QR).to.not.be(undefined);
    expect(response.body.OID4VP).to.equal(
      'openid://vc/?request_uri=https://requri.example.com/123'
    );
    expect(response.body.workflowId).to.equal(testRP.workflow.id);
    expect(insertStub.called).to.be(true);
    expect(getMsalClientStub.called).to.be(true);
    expect(makeHttpPostRequestStub.called).to.be(true);
    insertStub.restore();
    getMsalClientStub.restore();
    makeHttpPostRequestStub.restore();
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

  it('should update exchange status after verification with vp token',
    async function() {
      const findStub = sinon.stub(exchanges, 'findOne').resolves(
        testEx
      );
      const updateStub = sinon.stub(exchanges, 'updateOne').resolves();
      const dateStub = sinon.stub(Date, 'now').returns(1699635246762);
      const testVpToken = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1'
        ],
        type: [
          'VerifiablePresentation'
        ],
        verifiableCredential: [
          {
            '@context': [
              'https://www.w3.org/2018/credentials/v1',
              'https://www.w3.org/2018/credentials/examples/v1'
            ],
            id: 'https://example.com/credentials/1872',
            type: [
              'VerifiableCredential',
              'IDCardCredential'
            ],
            issuer: {
              id: 'did:example:issuer'
            },
            issuanceDate: '2010-01-01T19:23:24Z',
            credentialSubject: {
              given_name: 'Fredrik',
              family_name: 'Str&#246;mberg',
              birthdate: '1949-01-22'
            },
            proof: {
              type: 'Ed25519Signature2018',
              created: '2021-03-19T15:30:15Z',
              jws: 'eyJhbGciOiJFZER..PT8yCqVjj5ZHD0W',
              proofPurpose: 'assertionMethod',
              verificationMethod: 'did:example:issuer#keys-1'
            }
          }
        ],
        id: 'ebc6f1c2',
        holder: 'did:example:holder',
        proof: {
          type: 'Ed25519Signature2018',
          created: '2021-03-19T15:30:15Z',
          challenge: 'n-0S6_WzA2Mj',
          domain: 's6BhdRkqt3',
          jws: 'eyJhbGciOiJFZER..GF5Z6TamgNE8QjE',
          proofPurpose: 'authentication',
          verificationMethod: 'did:example:holder#key-1'
        }
      };
      const response = await request(app)
        .post('/verification/callback')
        .set(
          'Authorization', `Bearer ${testEx.accessToken}`
        )
        .send({
          requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
          requestStatus: 'presentation_verified',
          subject: 'did:web:verifiedid.contoso.com',
          receipt: {
            vp_token: testVpToken
          },
          verifiedCredentialsData: []
        })
        .set('Accept', 'application/json');

      expect(response.headers['content-type']).to.match(/json/);
      expect(response.status).to.equal(200);
      expect(findStub.called).to.be(true);
      expect(updateStub.calledWith({
        id: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
        state: 'complete'
      }, {$set: {
        'variables.results.final': {
          verifiablePresentation: testVpToken
        },
        updatedAt: 1699635246762
      }})).to.be(true);
      expect(dateStub.called).to.be(true);
      findStub.restore();
      updateStub.restore();
      dateStub.restore();
    });

  it('should update exchange status after verification without vp token',
    async function() {
      const findStub = sinon.stub(exchanges, 'findOne').resolves(
        testEx
      );
      const updateStub = sinon.stub(exchanges, 'updateOne').resolves();
      const dateStub = sinon.stub(Date, 'now').returns(1699635246762);
      const testEntraVcData = [
        {
          issuer: 'did:ion:issuer123',
          type: [
            'VerifiableCredential',
            'VerifiedCredentialExpert'
          ],
          claims: {
            firstName: 'Megan',
            lastName: 'Bowen'
          },
          credentialState: {
            revocationStatus: 'VALID'
          },
          domainValidation: {
            url: 'https://contoso.com'
          },
          issuanceDate: '2010-01-01T19:23:24Z',
          expirationDate: '2020-01-01T19:23:24Z'
        }
      ];
      const testW3cVcData = [{
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          {'@vocab': 'https://schema.org'}
        ],
        type: [
          'VerifiableCredential',
          'VerifiedCredentialExpert'
        ],
        issuer: 'did:ion:issuer123',
        issuanceDate: '2010-01-01T19:23:24Z',
        expirationDate: '2020-01-01T19:23:24Z',
        credentialSubject: {
          firstName: 'Megan',
          lastName: 'Bowen'
        }
      }];
      const response = await request(app)
        .post('/verification/callback')
        .set(
          'Authorization', `Bearer ${testEx.accessToken}`
        )
        .send({
          requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
          requestStatus: 'presentation_verified',
          subject: 'did:web:verifiedid.contoso.com',
          receipt: {},
          verifiedCredentialsData: testEntraVcData
        })
        .set('Accept', 'application/json');

      expect(response.headers['content-type']).to.match(/json/);
      expect(response.status).to.equal(200);
      expect(findStub.called).to.be(true);
      expect(updateStub.calledWith({
        id: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
        state: 'complete'
      }, {$set: {
        'variables.results.final': {
          verifiablePresentation: {
            '@context': ['https://www.w3.org/2018/credentials/v1'],
            type: ['VerifiablePresentation'],
            verifiableCredential: testW3cVcData,
            holder: 'did:web:verifiedid.contoso.com'
          }
        },
        updatedAt: 1699635246762
      }})).to.be(true);
      expect(dateStub.called).to.be(true);
      findStub.restore();
      updateStub.restore();
      dateStub.restore();
    });
});
