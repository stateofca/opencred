import * as sinon from 'sinon';
import {before, describe, it} from 'mocha';
import {decodeJwt} from 'jose';
import expect from 'expect.js';
import fs from 'node:fs';
import request from 'supertest';
import {zcapClient} from '../common/zcap.js';

import {msalUtils, verifyUtils} from '../common/utils.js';
import {app} from '../app.js';
import {config} from '../config/config.js';
import {exchanges} from '../common/database.js';

const testRP = {
  workflow: {
    type: 'native',
    id: 'testworkflow',
    steps: {
      waiting: {
        verifiablePresentationRequest: JSON.stringify({
          query: {
            type: 'QueryByExample',
            credentialQuery: {
              reason: 'Please present your Driver\'s License',
              example: {
                '@context': [
                  'https://www.w3.org/2018/credentials/v1',
                  'https://w3id.org/vdl/v1',
                  'https://w3id.org/vdl/aamva/v1'
                ],
                type: [
                  'Iso18013DriversLicense'
                ]
              }
            }
          },
        })
      }
    }
  },
  clientId: 'test',
  clientSecret: 'shhh',
  redirectUri: 'https://example.com',
  scopes: [{name: 'openid'}],
};

const exchange = JSON.parse(fs.readFileSync(
  './tests/fixtures/exchange.json'
));
exchange.createdAt = new Date();
exchange.recordExpiresAt = new Date();

describe('OpenCred API - Native Workflow', function() {
  let vp_token_di;
  let presentation_submission_di;
  let vp_token_jwt;
  let presentation_submission_jwt;
  let exchange_jwt;

  before(() => {
    const di = JSON.parse(fs.readFileSync(
      './tests/fixtures/oid4vp_di.json'
    ));
    vp_token_di = di.vp_token;
    presentation_submission_di = di.presentation_submission;
    const jwt = JSON.parse(fs.readFileSync(
      './tests/fixtures/oid4vp_jwt.json'
    ));
    vp_token_jwt = jwt.vp_token;
    presentation_submission_jwt = jwt.presentation_submission;
    exchange_jwt = {
      ...jwt.exchange,
      createdAt: new Date(),
      recordExpiresAt: new Date()
    };
  });

  this.beforeEach(() => {
    this.rpStub = sinon.stub(config, 'relyingParties').value([testRP]);
  });

  this.afterEach(() => {
    this.rpStub.restore();
  });

  it('should return 404 for unknown workflow id', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves(
      exchange
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

  it('should return 404 if invalid workflowId', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves({
      ...exchange,
      workflowId: 'WRONG'
    });
    const response = await request(app)
      .get(
        `/workflows/${testRP.workflow.id}/exchanges/${exchange.id}/` +
        'openid/client/authorization/request'
      );
    expect(response.status).to.equal(404);
    expect(response.headers['content-type']).to.match(/json/);

    findStub.restore();
  });

  it('should return Presentation Request JWT', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves(exchange);
    const updateStub = sinon.stub(exchanges, 'updateOne').resolves();
    const domainStub = sinon.stub(config, 'domain').value(
      'https://example.com'
    );
    const response = await request(app)
      .get(
        `/workflows/${testRP.workflow.id}/exchanges/${exchange.id}/` +
        'openid/client/authorization/request'
      );
    expect(response.status).to.equal(200);
    expect(response.headers['content-type']).to.match(
      /application\/oauth-authz-req\+jwt/
    );
    const jwt = decodeJwt(response.text);
    expect(jwt.client_id.startsWith('did:web:example.com')).to.be(true);
    expect(response.text).to.not.be(undefined);

    domainStub.restore();
    updateStub.restore();
    findStub.restore();
  });

  it('should return status on exchange', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves(
      exchange
    );
    const response = await request(app)
      .get(`/workflows/${testRP.workflow.id}/exchanges/${exchange.id}`)
      .set(
        'Authorization', `Bearer ${exchange.accessToken}`
      );

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.exchange.id).to.equal(exchange.id);
    findStub.restore();
  });

  it('should allow POST to exchange endpoint', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves(exchange);
    const response = await request(app)
      .post(`/workflows/${testRP.workflow.id}/exchanges/${exchange.id}`)
      .send()
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    findStub.restore();
  });

  it('should 404 on POST to exchange endpoint if expired', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves({
      ...exchange, createdAt: new Date(new Date().getTime() - 1000 * 1000)
    });
    const response = await request(app)
      .post(`/workflows/${testRP.workflow.id}/exchanges/${exchange.id}`)
      .send()
      .set('Accept', 'application/json');

    expect(response.status).to.equal(404);
    findStub.restore();
  });

  it('OID4VP should handle DI authorization response', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves(exchange);
    const updateStub = sinon.stub(exchanges, 'updateOne');
    const response = await request(app)
      .post(`/workflows/${testRP.workflow.id}/exchanges/${exchange.id}/` +
        'openid/client/authorization/response')
      .send({
        vp_token: vp_token_di,
        presentation_submission: presentation_submission_di
      });

    expect(response.status).to.equal(204);
    findStub.restore();
    updateStub.restore();
  });

  it('OID4VP should handle JWT authorization response', async function() {
    const findStub = sinon.stub(exchanges, 'findOne').resolves(
      exchange_jwt
    );
    const verifyUtilsStub = sinon.stub(verifyUtils, 'verifyJWTPresentation')
      .resolves({verified: true});
    const updateStub = sinon.stub(exchanges, 'updateOne');
    const response = await request(app)
      .post(`/workflows/${testRP.workflow.id}/exchanges/${exchange.id}/` +
        'openid/client/authorization/response')
      .send({
        vp_token: vp_token_jwt,
        presentation_submission: presentation_submission_jwt
      });

    findStub.restore();
    updateStub.restore();
    verifyUtilsStub.restore();
    expect(response.status).to.equal(204);
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
      exchange
    );
    const zcapStub = sinon.stub(zcapClient, 'zcapReadRequest')
      .resolves({data: exchange});
    const response = await request(app)
      .get(`/workflows/${testRP.workflow.id}/exchanges/${exchange.id}`)
      .set(
        'Authorization', `Bearer ${exchange.accessToken}`
      );

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.exchange.id).to.equal(exchange.id);
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
          expiry: Date.now() + 1000000
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
      exchange
    );
    const response = await request(app)
      .get(`/workflows/${testRP.workflow.id}/exchanges/${exchange.id}`)
      .set(
        'Authorization', `Bearer ${exchange.accessToken}`
      );

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.exchange.id).to.equal(exchange.id);
    findStub.restore();
  });

  it('should update exchange status after verification with object vp token',
    async function() {
      const findStub = sinon.stub(exchanges, 'findOne').resolves(
        exchange
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
          'Authorization', `Bearer ${exchange.accessToken}`
        )
        .send({
          requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
          requestStatus: 'presentation_verified',
          receipt: {
            vp_token: testVpToken
          }
        })
        .set('Accept', 'application/json');

      expect(response.headers['content-type']).to.match(/json/);
      expect(response.status).to.equal(200);
      expect(findStub.called).to.be(true);
      expect(updateStub.calledWithMatch({
        id: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
        state: 'complete'
      }, {$set: {
        'variables.results.final': {
          verifiablePresentation: testVpToken
        },
        updatedAt: 1699635246762,
      }})).to.be(true);
      expect(dateStub.called).to.be(true);
      findStub.restore();
      updateStub.restore();
      dateStub.restore();
    });

  it('should update exchange status after verification with string vp token',
    async function() {
      const findStub = sinon.stub(exchanges, 'findOne').resolves(
        exchange
      );
      const updateStub = sinon.stub(exchanges, 'updateOne').resolves();
      const dateStub = sinon.stub(Date, 'now').returns(1699635246762);
      const testVpToken = `
        eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtp
        ZCI6ImRpZDpleGFtcGxlOjB4YWJjI2tleTEifQ.e
        yJpc3MiOiJkaWQ6ZXhhbXBsZTplYmZlYjFmNzEyZ
        WJjNmYxYzI3NmUxMmVjMjEiLCJqdGkiOiJ1cm46d
        XVpZDozOTc4MzQ0Zi04NTk2LTRjM2EtYTk3OC04Z
        mNhYmEzOTAzYzUiLCJhdWQiOiJkaWQ6ZXhhbXBsZ
        To0YTU3NTQ2OTczNDM2ZjZmNmM0YTRhNTc1NzMiL
        CJuYmYiOjE1NDE0OTM3MjQsImlhdCI6MTU0MTQ5M
        zcyNCwiZXhwIjoxNTczMDI5NzIzLCJub25jZSI6I
        jM0M3MkRlNGRGEtIiwidnAiOnsiQGNvbnRleHQiO
        lsiaHR0cHM6Ly93d3cudzMub3JnLzIwMTgvY3JlZ
        GVudGlhbHMvdjEiLCJodHRwczovL3d3dy53My5vc
        mcvMjAxOC9jcmVkZW50aWFscy9leGFtcGxlcy92M
        SJdLCJ0eXBlIjpbIlZlcmlmaWFibGVQcmVzZW50Y
        XRpb24iLCJDcmVkZW50aWFsTWFuYWdlclByZXNlb
        nRhdGlvbiJdLCJ2ZXJpZmlhYmxlQ3JlZGVudGlhb
        CI6WyJleUpoYkdjaU9pSlNVekkxTmlJc0luUjVjQ
        0k2SWtwWFZDSXNJbXRwWkNJNkltUnBaRHBsZUdGd
        GNHeGxPbUZpWm1VeE0yWTNNVEl4TWpBME16RmpNa
        mMyWlRFeVpXTmhZaU5yWlhsekxURWlmUS5leUp6Z
        FdJaU9pSmthV1E2WlhoaGJYQnNaVHBsWW1abFlqR
        m1OekV5WldKak5tWXhZekkzTm1VeE1tVmpNakVpT
        ENKcWRHa2lPaUpvZEhSd09pOHZaWGhoYlhCc1pTN
        WxaSFV2WTNKbFpHVnVkR2xoYkhNdk16Y3pNaUlzS
        W1semN5STZJbWgwZEhCek9pOHZaWGhoYlhCc1pTN
        WpiMjB2YTJWNWN5OW1iMjh1YW5kcklpd2libUptS
        WpveE5UUXhORGt6TnpJMExDSnBZWFFpT2pFMU5ER
        TBPVE0zTWpRc0ltVjRjQ0k2TVRVM016QXlPVGN5T
        Xl3aWJtOXVZMlVpT2lJMk5qQWhOak0wTlVaVFpYS
        WlMQ0oyWXlJNmV5SkFZMjl1ZEdWNGRDSTZXeUpvZ
        EhSd2N6b3ZMM2QzZHk1M015NXZjbWN2TWpBeE9DO
        WpjbVZrWlc1MGFXRnNjeTkyTVNJc0ltaDBkSEJ6T
        2k4dmQzZDNMbmN6TG05eVp5OHlNREU0TDJOeVpXU
        mxiblJwWVd4ekwyVjRZVzF3YkdWekwzWXhJbDBzS
        W5SNWNHVWlPbHNpVm1WeWFXWnBZV0pzWlVOeVpXU
        mxiblJwWVd3aUxDSlZibWwyWlhKemFYUjVSR1ZuY
        21WbFEzSmxaR1Z1ZEdsaGJDSmRMQ0pqY21Wa1pXN
        TBhV0ZzVTNWaWFtVmpkQ0k2ZXlKa1pXZHlaV1VpT
        25zaWRIbHdaU0k2SWtKaFkyaGxiRzl5UkdWbmNtV
        mxJaXdpYm1GdFpTSTZJanh6Y0dGdUlHeGhibWM5S
        jJaeUxVTkJKejVDWVdOallXeGhkWExEcVdGMElHV
        nVJRzExYzJseGRXVnpJRzUxYmNPcGNtbHhkV1Z6U
        EM5emNHRnVQaUo5ZlgxOS5LTEpvNUdBeUJORDNMR
        FRuOUg3RlFva0VzVUVpOGpLd1hoR3ZvTjNKdFJhN
        TF4ck5EZ1hEYjBjcTFVVFlCLXJLNEZ0OVlWbVIxT
        klfWk9GOG9HY183d0FwOFBIYkYySGFXb2RRSW9PQ
        nh4VC00V05xQXhmdDdFVDZsa0gtNFM2VXgzclNHQ
        W1jek1vaEVFZjhlQ2VOLWpDOFdla2RQbDZ6S1pRa
        jBZUEIxcng2WDAteGxGQnM3Y2w2V3Q4cmZCUF90W
        jlZZ1ZXclFtVVd5cFNpb2MwTVV5aXBobXlFYkxaY
        WdUeVBsVXlmbEdsRWRxclpBdjZlU2U2UnR4Snk2T
        TEtbEQ3YTVIVHphbllUV0JQQVVIRFpHeUdLWGRKd
        y1XX3gwSVdDaEJ6STh0M2twRzI1M2ZnNlYzdFBnS
        GVLWEU5NGZ6X1FwWWZnLS03a0xzeUJBZlFHYmciX
        X19.ft_Eq4IniBrr7gtzRfrYj8Vy1aPXuFZU-6_a
        i0wvaKcsrzI4JkQEKTvbJwdvIeuGuTqy7ipO-EYi
        7V4TvonPuTRdpB7ZHOlYlbZ4wA9WJ6mSVSqDACvY
        RiFvrOFmie8rgm6GacWatgO4m4NqiFKFko3r58Lu
        eFfGw47NK9RcfOkVQeHCq4btaDqksDKeoTrNysF4
        YS89INa-prWomrLRAhnwLOo1Etp3E4ESAxg73CR2
        kA5AoMbf5KtFueWnMcSbQkMRdWcGC1VssC0tB0Jf
        fVjq7ZV6OTyV4kl1-UVgiPLXUTpupFfLRhf9QpqM
        BjYgP62KvhIvW8BbkGUelYMetA`;
      const testVp = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://www.w3.org/2018/credentials/examples/v1'
        ],
        type: [
          'VerifiablePresentation',
          'CredentialManagerPresentation'
        ],
        verifiableCredential: [{
          '@context': [
            'https://www.w3.org/2018/credentials/v1',
            'https://www.w3.org/2018/credentials/examples/v1'
          ],
          type: [
            'VerifiableCredential',
            'UniversityDegreeCredential'
          ],
          credentialSubject: {
            degree: {
              type: 'BachelorDegree',
              name:
                `<span lang='fr-CA'>Baccalauréat en musiques numériques</span>`
            }
          }
        }]
      };
      const response = await request(app)
        .post('/verification/callback')
        .set(
          'Authorization', `Bearer ${exchange.accessToken}`
        )
        .send({
          requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
          requestStatus: 'presentation_verified',
          receipt: {
            vp_token: testVpToken
          }
        })
        .set('Accept', 'application/json');

      expect(response.headers['content-type']).to.match(/json/);
      expect(response.status).to.equal(200);
      expect(findStub.called).to.be(true);
      expect(updateStub.calledWithMatch({
        id: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
        state: 'complete'
      }, {$set: {
        'variables.results.final': {
          verifiablePresentation: testVp
        },
        updatedAt: 1699635246762
      }})).to.be(true);
      expect(dateStub.called).to.be(true);
      findStub.restore();
      updateStub.restore();
      dateStub.restore();
    });
});
