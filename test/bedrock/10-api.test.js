/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {decodeJwt} from 'jose';
import expect from 'expect.js';
import fs from 'node:fs';
import {klona} from 'klona';
import {zcapClient} from '../../common/zcap.js';

import {
  convertDerCertificateToPem,
  generateCertificateChain
} from '../utils/x509.js';
import {createPresentation, signPresentation} from '@digitalbazaar/vc';
import {exampleKey, exampleKey2} from '../fixtures/signingKeys.js';
import {
  generatePresentationSubmission,
  generateValidJwtVpToken
} from '../utils/jwtVpTokens.js';
import {auditUtils} from '../../common/audit.js';
import {baseUrl} from '../mock-data.js';
import {BaseWorkflowService} from '../../lib/workflows/base.js';
import {buildExchangeResultToken} from '../../lib/workflows/common.js';
import {config} from '@bedrock/core';
import {createExchangeWithAuthRequest} from '../utils/exchanges.js';
import {database} from '../../lib/database.js';
import {documentLoader} from '../utils/testDocumentLoader.js';
import {domainToDidWeb} from '../../lib/didWeb.js';
import {generateValidDidKeyData} from '../utils/dids.js';
import {generateValidSignedCredential} from '../utils/credentials.js';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';
import {msalUtils} from '../../common/utils.js';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

const testWorkflow = {
  type: 'native',
  clientId: 'test',
  query: [{
    context: [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/vdl/v1',
      'https://w3id.org/vdl/aamva/v1'
    ],
    type: ['Iso18013DriversLicense']
  }],
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
    }
  }),
  clientSecret: 'shhh',
  oidc: {
    redirectUri: 'https://example.com'
  }
};

const testWorkflow2 = klona(testWorkflow);
testWorkflow2.clientId = 'test2';
testWorkflow2.query = [{
  context: [
    'https://www.w3.org/ns/credentials/v2',
    'https://www.w3.org/ns/credentials/examples/v2'
  ],
  type: ['MyPrototypeCredential']
}];
testWorkflow2.verifiablePresentationRequest = JSON.stringify({
  query: {
    type: 'QueryByExample',
    credentialQuery: {
      reason: 'Please present your Prototype Credential',
      example: {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          'https://www.w3.org/ns/credentials/examples/v2'
        ],
        type: 'MyPrototypeCredential'
      }
    }
  }
});

const testWorkflow3 = klona(testWorkflow);
testWorkflow3.clientId = 'test3';
testWorkflow3.query = [{
  context: [
    'https://www.w3.org/2018/credentials/v1',
    'https://www.w3.org/2018/credentials/examples/v1'
  ],
  type: ['UniversityDegreeCredential']
}];
testWorkflow3.verifiablePresentationRequest = JSON.stringify({
  query: {
    type: 'QueryByExample',
    credentialQuery: {
      reason: 'Please present your Univeristy Degree',
      example: {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://www.w3.org/2018/credentials/examples/v1'
        ],
        type: 'UniversityDegreeCredential'
      }
    }
  }
});

const testWorkflow4 = klona(testWorkflow);
testWorkflow4.clientId = 'test4';
testWorkflow4.query = [{
  context: [
    'https://www.w3.org/2018/credentials/v1',
    'https://w3id.org/citizenship/v1'
  ],
  type: ['PermanentResidentCard']
}];
testWorkflow4.verifiablePresentationRequest = JSON.stringify({
  query: {
    type: 'QueryByExample',
    credentialQuery: {
      reason: 'Please present your Permanent Resident Card',
      example: {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://w3id.org/citizenship/v1'
        ],
        type: 'PermanentResidentCard'
      }
    }
  }
});

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

const entraExchange = JSON.parse(fs.readFileSync(
  './test/fixtures/entra-exchange.json'
));
entraExchange.createdAt = new Date();
entraExchange.recordExpiresAt = new Date();

describe('OpenCred API - Native Workflow', function() {
  this.beforeEach(() => {
    this.rpStub = sinon.stub(config.opencred, 'workflows').value(
      [testWorkflow, testWorkflow2, testWorkflow3, testWorkflow4]);
    this.signingKeysStub = sinon.stub(config.opencred, 'signingKeys')
      .value([{...exampleKey, purpose: ['id_token']}]);
  });

  this.afterEach(() => {
    this.rpStub.restore();
    this.signingKeysStub?.restore();
  });

  it('should return 404 for unknown workflow id', async function() {
    let err;
    let result;
    try {
      result = await client
        .post(`${baseUrl}/workflows/not-the-${
          testWorkflow.clientId}/exchanges`);
    } catch(e) {
      err = e;
    }

    should.not.exist(result);
    err.status.should.equal(404);
    err.data.message.should.equal('Unknown workflow id');
  });

  it('should create a new exchange with the workflow', async function() {
    const exchange = await createExchangeWithAuthRequest({
      workflow: testWorkflow});
    const insertStub = sinon.stub(database.collections.Exchanges, 'insertOne')
      .resolves(exchange);
    const basic = Buffer.from('test:shhh').toString('base64');
    let result;
    let err;
    try {
      result = await client
        .post(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges`, {
          headers: {Authorization: `Basic ${basic}`}
        });
    } catch(e) {
      err = e;
      console.log(e);
    }

    should.not.exist(err);
    result.status.should.equal(200);
    result.data.id.should.be.a('string');
    result.data.vcapi.should.be.a('string');
    result.data.OID4VP.should.be.a('string');
    result.data.accessToken.should.be.a('string');
    result.data.workflowId.should.be.a('string');
    result.data.protocols.should.have.property('interact');
    result.data.protocols.interact.should.contain('/interactions/');
    insertStub.called.should.equal(true);
    insertStub.restore();
  });

  it('should return 404 if invalid workflowId', async function() {
    const exchange = await createExchangeWithAuthRequest({
      workflow: testWorkflow});
    const modifiedExchange = {...exchange, workflowId: 'WRONG'};
    const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
      .resolves(modifiedExchange);
    let result;
    let err;
    try {
      result = await client
        .get(
          `${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/request`);
    } catch(e) {
      err = e;
    }
    should.not.exist(result);
    err.status.should.equal(404);
    err.data.message.should.equal('Exchange not found');

    findStub.restore();
  });

  it('should return Authorization Request JWT', async function() {
    const exchange = await createExchangeWithAuthRequest({
      workflow: testWorkflow});
    const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
      .resolves({...exchange, workflowId: testWorkflow.clientId});
    const updateStub = sinon.stub(database.collections.Exchanges, 'updateOne')
      .resolves();
    const baseUri = sinon.stub(config.server, 'baseUri').value(
      'https://example.com'
    );
    const keyStub = sinon.stub(config.opencred, 'signingKeys').value(
      [{...exampleKey2, purpose: ['authorization_request']}]
    );

    let result;
    let err;
    try {
      result = await client
        .get(
          `${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/request`
        );
    } catch(e) {
      err = e;
    }
    should.not.exist(err);
    result.status.should.equal(200);
    result.headers.get('content-type').should.contain(
      'application/oauth-authz-req+jwt'
    );
    const jwt = decodeJwt(await result.text());
    jwt.client_id.should.have.string('did:web:example.com');

    baseUri.restore();
    updateStub.restore();
    keyStub.restore();
    findStub.restore();
  });

  it('should return status on exchange', async function() {
    const exchange = await createExchangeWithAuthRequest({
      workflow: testWorkflow});
    const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
      .resolves(exchange);
    let result;
    let err;
    try {
      result = await client
        .get(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
          `${exchange.id}`, {
          headers: {Authorization: `Bearer ${exchange.accessToken}`}
        });
    } catch(e) {
      err = e;
    }

    should.not.exist(err);
    result.status.should.be.equal(200);
    result.data.exchange.id.should.be.equal(exchange.id);
    should.not.exist(result.data.exchange.accessToken);
    findStub.restore();
  });

  it('should return status on exchange with Bearer exchange_result token',
    async function() {
      const signingKeysStub = sinon.stub(config.opencred, 'signingKeys')
        .value([{...exampleKey, purpose: ['id_token']}]);
      const exchange = await createExchangeWithAuthRequest({
        workflow: testWorkflow});
      const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(exchange);
      const token = await buildExchangeResultToken({
        exchangeId: exchange.id,
        workflowId: testWorkflow.clientId,
        procedurePath: 'verification'
      });
      let result;
      let err;
      try {
        result = await client
          .get(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
            `${exchange.id}`, {
            headers: {Authorization: `Bearer ${token}`}
          });
      } catch(e) {
        err = e;
      }

      should.not.exist(err);
      result.status.should.be.equal(200);
      result.data.exchange.id.should.be.equal(exchange.id);
      findStub.restore();
      signingKeysStub.restore();
    });

  it('should scrub credential data when Bearer exchange_result token has ' +
    'exchange:partial scope', async function() {
    const signingKeysStub = sinon.stub(config.opencred, 'signingKeys')
      .value([{...exampleKey, purpose: ['id_token']}]);
    const exchange = await createExchangeWithAuthRequest({
      workflow: testWorkflow});
    exchange.variables = {
      ...exchange.variables,
      results: {
        default: {
          verifiablePresentation: {type: ['VerifiablePresentation']},
          vpToken: 'eyJhbGciOiJFUzI1NiJ9.test.sig',
          errors: ['Some error']
        }
      }
    };
    const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
      .callsFake(query => Promise.resolve(
        query.accessToken && query.accessToken.includes('.') ?
          null : exchange
      ));
    try {
      const token = await buildExchangeResultToken({
        exchangeId: exchange.id,
        workflowId: testWorkflow.clientId,
        procedurePath: 'verification',
        scope: 'exchange:partial'
      });
      let result;
      let err;
      try {
        result = await client
          .get(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
            `${exchange.id}`, {
            headers: {Authorization: `Bearer ${token}`}
          });
      } catch(e) {
        err = e;
      }

      should.not.exist(err);
      result.status.should.be.equal(200);
      result.data.exchange.id.should.be.equal(exchange.id);
      should.not.exist(result.data.exchange.variables?.results?.default
        ?.verifiablePresentation);
      should.not.exist(result.data.exchange.variables?.results?.default
        ?.vpToken);
      result.data.exchange.variables.results.default.errors
        .should.eql(['Some error']);
    } finally {
      findStub.restore();
      signingKeysStub.restore();
    }
  });

  it('should allow POST to exchange endpoint', async function() {
    const exchange = await createExchangeWithAuthRequest({
      workflow: testWorkflow});
    const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
      .resolves(exchange);
    let result;
    let err;
    try {
      result = await client
        .post(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
          `${exchange.id}`);
    } catch(e) {
      err = e;
    }
    should.not.exist(err);
    result.status.should.be.equal(200);

    findStub.restore();
  });

  it('should 404 on POST to exchange endpoint if expired', async function() {
    const exchange = await createExchangeWithAuthRequest({
      workflow: testWorkflow});
    // Set createdAt to be far enough in the past that it's clearly expired
    // Default ttl is 900 seconds, so set createdAt to 2000 seconds ago
    // This ensures expiry = createdAt + ttl = (now - 2000) + 900 =
    // now - 1100 seconds (expired)
    const expiredCreatedAt = new Date(new Date().getTime() - 2000 * 1000);
    // Ensure ttl is set (default is 900 seconds)
    const ttl = exchange.ttl || 900;
    const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
      .resolves({
        ...exchange,
        createdAt: expiredCreatedAt,
        ttl // Explicitly set ttl to ensure expiration check works
      });
    let result;
    let err;
    try {
      result = await client
        .post(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
          `${exchange.id}`);
    } catch(e) {
      err = e;
    }

    should.not.exist(result);
    err.status.should.equal(404);

    findStub.restore();
  });

  it('OID4VP should handle DI authorization response', async function() {
    const exchange2 = await createExchangeWithAuthRequest({
      workflow: testWorkflow4});
    const {
      did: holderDid, suite: holderSuite
    } = await generateValidDidKeyData();
    const {credential} = await generateValidSignedCredential({
      holderDid,
      didMethod: 'key',
      documentLoader,
      credentialTemplate: {
        '@context': ['https://www.w3.org/2018/credentials/v1', 'https://w3id.org/citizenship/v1'],
        type: ['VerifiableCredential', 'PermanentResidentCard'],
        credentialSubject: {
          type: [
            'PermanentResident',
            'Person'
          ],
          givenName: 'JANE',
          familyName: 'SMITH',
          gender: 'Female',
          residentSince: '2015-01-01',
          lprCategory: 'C09',
          lprNumber: '999-999-999',
          commuterClassification: 'C1',
          birthCountry: 'Arcadia',
          birthDate: '1978-07-17'
        }
      }
    });
    const presentation = await signPresentation({
      presentation: createPresentation({
        verifiableCredential: [credential],
        holder: holderDid
      }),
      challenge: exchange2.challenge,
      documentLoader,
      suite: holderSuite
    });

    const aR = exchange2.variables.authorizationRequest;
    const presentation_submission_di = {
      id: `urn:uuid:${globalThis.crypto.randomUUID()}`,
      definition_id: aR.presentation_definition.id,
      descriptor_map: [
        {
          id: aR?.presentation_definition.input_descriptors?.[0].id,
          path: '$',
          format: 'ldp_vp',
          path_nested: {
            format: 'ldp_vc',
            path: '$.verifiableCredential[0]'
          }
        }
      ]
    };
    const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
      .resolves(exchange2);
    const updateStub = sinon.stub(database.collections.Exchanges, 'updateOne')
      .resolves();
    let result;
    let err;
    try {
      const searchParams = new URLSearchParams();
      searchParams.set('vp_token', JSON.stringify(presentation));
      searchParams.set('presentation_submission',
        JSON.stringify(presentation_submission_di));
      result = await client
        .post(`${baseUrl}/workflows/${testWorkflow4.clientId}/exchanges/` +
          `${exchange2.id}/openid/client/authorization/response`, {
          body: searchParams,
          headers: {
            'content-type': 'application/x-www-form-urlencoded'
          }});
    } catch(e) {
      err = e;
    }
    should.not.exist(err);
    result.status.should.be.equal(200);
    result.data.redirect_uri.should.be.a('string');
    result.data.redirect_uri.should.contain('exchange_token=');
    result.data.redirect_uri.should.contain('/verification');

    findStub.restore();
    updateStub.restore();
  });

  it('OID4VP should reject schema mismatch', async function() {
    const exchange = await createExchangeWithAuthRequest({
      workflow: testWorkflow});
    const {
      did: holderDid, suite: holderSuite
    } = await generateValidDidKeyData();
    const {credential} = await generateValidSignedCredential({
      holderDid,
      didMethod: 'key',
      documentLoader
    });
    const presentation = await signPresentation({
      presentation: createPresentation({
        verifiableCredential: [credential],
        holder: holderDid
      }),
      challenge: exchange.challenge,
      documentLoader,
      suite: holderSuite
    });

    const aR = exchange.variables.authorizationRequest;
    const presentation_submission_di = {
      id: `urn:uuid:${globalThis.crypto.randomUUID()}`,
      definition_id: aR.presentation_definition.id,
      descriptor_map: [
        {
          id: aR?.presentation_definition.input_descriptors?.[0].id,
          path: '$',
          format: 'ldp_vp',
          path_nested: {
            format: 'ldp_vc',
            path: '$.verifiableCredential[0]'
          }
        }
      ]
    };
    const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
      .resolves(exchange);
    const updateStub = sinon.stub(database.collections.Exchanges, 'updateOne')
      .resolves();
    let err;
    try {
      const searchParams = new URLSearchParams();
      searchParams.set('vp_token', JSON.stringify(presentation));
      searchParams.set('presentation_submission',
        JSON.stringify(presentation_submission_di));
      // this test credential doesn't match the testWorkflow schema,
      // matches testWorkflow2
      await client
        .post(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/response`, {
          body: searchParams,
          headers: {
            'content-type': 'application/x-www-form-urlencoded'
          }});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.data.errors[0].should.include(
      'Presentation does not match requested credential');

    findStub.restore();
    updateStub.restore();
  });

  it('OID4VP should handle JWT authorization response', async function() {
    const exchange = await createExchangeWithAuthRequest({
      workflow: testWorkflow3});

    // Generate the VP token with template matching testWorkflow3 requirements
    // Include the exchange challenge as nonce for verification
    const {vpToken: vp_token_jwt} = await generateValidJwtVpToken({
      aud: domainToDidWeb(config.server.baseUri),
      challenge: exchange.challenge,
      template: {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://www.w3.org/2018/credentials/examples/v1'
        ],
        type: ['VerifiableCredential', 'UniversityDegreeCredential']
      }
    });

    const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
      .resolves(exchange);
    const updateStub = sinon.stub(database.collections.Exchanges, 'replaceOne')
      .resolves();
    let result;
    let err;
    // Generate presentation submission matching the authorization request
    const presentation_submission_jwt = generatePresentationSubmission({
      authorizationRequest: exchange.variables.authorizationRequest,
      vpToken: vp_token_jwt
    });
    try {
      const searchParams = new URLSearchParams();
      // Draft 18 is ambiguous about format, says vp_token should be a
      // "JSON string". We wrap it in extra quotes to test normalization.
      searchParams.set('vp_token', JSON.stringify(vp_token_jwt));
      searchParams.set('presentation_submission',
        JSON.stringify(presentation_submission_jwt));
      result = await client
        .post(`${baseUrl}/workflows/${testWorkflow3.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/response`, {
          body: searchParams,
          headers: {'content-type': 'application/x-www-form-urlencoded'}
        });
    } catch(e) {
      err = e;
    }
    should.not.exist(err);
    result.status.should.be.equal(200);
    result.data.redirect_uri.should.be.a('string');
    result.data.redirect_uri.should.contain('exchange_token=');
    result.data.redirect_uri.should.contain('/verification');

    findStub.restore();
    updateStub.restore();
  });

  it('should fail callback after submitting presentation',
    async function() {
      const exchange = await createExchangeWithAuthRequest({
        workflow: testWorkflow});
      this.rpStub = sinon.stub(config.opencred, 'workflows').value([{
        ...testWorkflow,
        callback: {
          url: 'https://api.callback.example.com'
        }
      }]);
      const httpClientStub = sinon.stub(httpClient, 'post');
      const callbackUrl = 'https://api.callback.example.com';
      httpClientStub.withArgs(callbackUrl, sinon.match.any)
        .rejects({
          status: 400,
          name: 'InvalidRequestError',
          requestUrl: callbackUrl,
          message: 'Invalid request structure',
          data: {message: 'Invalid request structure'}
        });
      const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(exchange);
      const updateStub =
        sinon.stub(database.collections.Exchanges, 'replaceOne').resolves();
      let result;
      let err;
      // Generate real JWT tokens that will pass verification
      const {vpToken: vp_token_jwt} = await generateValidJwtVpToken({
        aud: domainToDidWeb(config.server.baseUri),
        challenge: exchange.challenge,
        template: {
          '@context': [
            'https://www.w3.org/2018/credentials/v1',
            'https://w3id.org/vdl/v1',
            'https://w3id.org/vdl/aamva/v1'
          ],
          type: ['VerifiableCredential', 'Iso18013DriversLicense'],
          credentialSubject: {
            givenName: 'John',
            familyName: 'Doe'
          }
        }
      });
      const presentation_submission = generatePresentationSubmission({
        authorizationRequest: exchange.variables.authorizationRequest,
        vpToken: vp_token_jwt
      });
      try {
        const searchParams = new URLSearchParams();
        searchParams.set('vp_token', vp_token_jwt);
        searchParams.set('presentation_submission',
          JSON.stringify(presentation_submission));
        result = await client
          .post(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
            `${exchange.id}/openid/client/authorization/response`, {
            body: searchParams,
            headers: {'content-type': 'application/x-www-form-urlencoded'}
          });
      } catch(e) {
        err = e;
      }
      // Check if updateStub was called
      should.exist(updateStub.callCount);
      expect(updateStub.callCount).to.be.greaterThan(0);
      const updatedExchange = updateStub.getCall(0)?.args[1];
      should.exist(updatedExchange);
      const updatedExchangeErrors =
        updatedExchange.variables?.results?.default?.errors;
      should.exist(updatedExchangeErrors);
      expect(Array.isArray(updatedExchangeErrors)).to.be.true;
      const [updatedExchangeError] = updatedExchangeErrors;
      expect(updatedExchangeError).to.equal('Callback failed to send.');

      should.not.exist(err);
      result.status.should.be.equal(204);

      this.rpStub.restore();
      httpClientStub.restore();
      findStub.restore();
      updateStub.restore();
    });
});

describe('OpenCred API - VC-API Workflow', function() {
  this.beforeEach(() => {
    this.rpStub = sinon.stub(config.opencred, 'workflows').value([{
      ...testWorkflow,
      type: 'vc-api',
      capability: '{}',
      vpr: '{}'
    }]);
  });

  this.afterEach(() => {
    this.rpStub.restore();
  });

  it('should create a new exchange with the workflow', async function() {
    const insertStub = sinon.stub(database.collections.Exchanges, 'insertOne')
      .resolves();
    const headers = new Headers({location: 'https://someexchanges.com/123'});
    const zcapStub = sinon.stub(zcapClient, 'zcapWriteRequest').resolves({
      result: {
        headers,
        status: 204
      }
    });
    let result;
    let err;
    try {
      const basic = Buffer.from(
        `${testWorkflow.clientId}:${testWorkflow.clientSecret}`
      ).toString('base64');
      result = await client
        .post(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges`, {
          headers: {Authorization: `Basic ${basic}`}
        });
    } catch(e) {
      err = e;
    }
    should.not.exist(err);
    result.status.should.be.equal(200);
    result.data.id.should.be.a('string');
    result.data.vcapi.should.be.a('string');
    insertStub.called.should.be.equal(true);
    zcapStub.called.should.be.equal(true);

    insertStub.restore();
    zcapStub.restore();
  });

  it('should return status on exchange', async function() {
    const exchange = await createExchangeWithAuthRequest({
      workflow: testWorkflow});
    const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
      .resolves(exchange);
    const zcapStub = sinon.stub(zcapClient, 'zcapReadRequest')
      .resolves({data: exchange});
    let result;
    let err;
    try {
      const token = exchange.accessToken;
      result = await client
        .get(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
          `${exchange.id}`, {headers: {Authorization: `Bearer ${token}`}});
    } catch(e) {
      err = e;
    }

    should.not.exist(err);
    result.status.should.be.equal(200);
    result.data.exchange.id.should.be.a('string');

    findStub.restore();
    zcapStub.restore();
  });

  // Draft test for once vc-api exchanges are used.
  it.skip('should updateDidDocumentHistory on complete exchange',
    async function() {
      const exchange = await createExchangeWithAuthRequest({
        workflow: testWorkflow});
      const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(exchange);
      const zcapStub = sinon.stub(zcapClient, 'zcapReadRequest')
        .resolves({data: {
          ...exchange,
          state: 'complete',
          variables: {
            default: {
              results: {
                verifiablePresentation: {
                // stubbed out verifiable presentation
                  type: 'VerifiablePresentation'
                }
              }
            }
          }
        }});
      const updateDidDocumentHistoryStub = sinon.stub(
        auditUtils, 'updateIssuerDidDocumentHistory')
        .resolves();
      let result;
      let err;
      try {
        const token = exchange.accessToken;
        result = await client
          .get(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
          `${exchange.id}`, {headers: {Authorization: `Bearer ${token}`}});
      } catch(e) {
        err = e;
      }

      should.not.exist(err);
      result.status.should.be.equal(200);
      result.data.exchange.id.should.be.a('string');

      zcapStub.called.should.be.equal(true);
      findStub.called.should.be.equal(true);
      updateDidDocumentHistoryStub.called.should.be.equal(true);

      findStub.restore();
      zcapStub.restore();
      updateDidDocumentHistoryStub.restore();
    });
});

describe('OpenCred API - Microsoft Entra Verified ID Workflow',
  function() {
    this.beforeEach(() => {
      this.rpStub = sinon.stub(config.opencred, 'workflows').value([{
        ...testWorkflow,
        type: 'microsoft-entra-verified-id',
        apiBaseUrl: 'https://api.entra.microsoft.example.com/v1.0',
        apiLoginBaseUrl: 'https://login.entra.microsoft.example.com',
        verifierDid: 'did:web:example.com',
        verifierName: 'Test Entra Verifier',
        acceptedCredentialType: 'Iso18013DriversLicenseCredential'
      }]);
    });

    this.afterEach(() => {
      this.rpStub.restore();
    });

    it('should create a new exchange with the workflow', async function() {
      const insertStub = sinon.stub(database.collections.Exchanges, 'insertOne')
        .resolves();
      const getMsalClientStub = sinon.stub(msalUtils, 'getMsalClient')
        .returns(null);
      const makeHttpPostRequestStub = sinon
        .stub(msalUtils, 'makeHttpPostRequest')
        .resolves({
          data: {
            requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
            url: 'openid://vc/?request_uri=https://requri.example.com/123',
            expiry: Date.now() + 1000000
          }
        });
      let result;
      let err;
      try {
        const basic = Buffer.from(`${testWorkflow.clientId}:${
          testWorkflow.clientSecret}`).toString('base64');
        result = await client
          .post(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges`, {
            headers: {Authorization: `Basic ${basic}`}
          });
      } catch(e) {
        err = e;
      }

      should.not.exist(err);
      result.status.should.be.equal(200);
      result.data.id.should.be.equal('c656dad8-a8fa-4361-baef-51af0c2e428e');
      result.data.vcapi.should.be.a('string');
      result.data.accessToken.should.be.a('string');
      result.data.OID4VP.should.be.equal(
        'openid4vp://?request_uri=https://requri.example.com/123&' +
        'client_id=did:web:example.com'
      );
      result.data.workflowId.should.be.equal(testWorkflow.clientId);
      insertStub.called.should.be.equal(true);
      getMsalClientStub.called.should.be.equal(true);
      makeHttpPostRequestStub.called.should.be.equal(true);

      insertStub.restore();
      getMsalClientStub.restore();
      makeHttpPostRequestStub.restore();
    });

    it('should return status on exchange', async function() {
      const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(entraExchange);
      let result;
      let err;
      try {
        result = await client
          .get(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
            `${entraExchange.id}`, {
            headers: {Authorization: `Bearer ${entraExchange.accessToken}`}
          });
      } catch(e) {
        err = e;
      }

      should.not.exist(err);
      result.status.should.be.equal(200);
      result.data.exchange.id.should.be.equal(entraExchange.id);

      findStub.restore();
    });

    it('should not expose apiAccessToken to status endpoint',
      async function() {
        const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves(entraExchange);
        let result;
        let err;
        try {
          result = await client
            .get(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
              `${entraExchange.id}`, {
              headers: {Authorization: `Bearer ${entraExchange.accessToken}`}
            });
        } catch(e) {
          err = e;
        }

        should.not.exist(err);
        result.status.should.be.equal(200);
        should.not.exist(result.data.exchange.apiAccessToken);

        findStub.restore();
      });

    it('should not expose apiAccessToken to login endpoint',
      async function() {
        const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves(entraExchange);
        let result;
        let err;
        try {
          result = await client
            .get(`${baseUrl}/context/login` +
              '?client_id=test&scope=openid' +
              '&redirect_uri=https%3A%2F%2Fexample.com', {
              headers: {
                Cookie: `exchangeId=${entraExchange.id}; ` +
                `accessToken=${entraExchange.accessToken}`
              }
            });
        } catch(e) {
          err = e;
        }

        should.not.exist(err);
        result.status.should.be.equal(200);
        should.not.exist(result.data.exchangeData.apiAccessToken);

        findStub.restore();
      });

    it('should not expose apiAccessToken to context verification endpoint',
      async function() {
        const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves(entraExchange);
        let result;
        let err;
        try {
          result = await client
            .get(`${baseUrl}/context/verification` +
              '?client_id=test&scope=openid' +
              '&redirect_uri=https%3A%2F%2Fexample.com', {
              headers: {
                Cookie: `exchangeId=${entraExchange.id}; ` +
                `accessToken=${entraExchange.accessToken}`
              }
            });
        } catch(e) {
          err = e;
        }

        should.not.exist(err);
        result.status.should.be.equal(200);
        should.not.exist(result.data.exchangeData.apiAccessToken);

        findStub.restore();
      });

    it('should handle falsy exchange when getting status',
      async function() {
        const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves(null);
        let result;
        let err;
        try {
          result = await client
            .get(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
              `${entraExchange.id}`, {
              headers: {Authorization: `Bearer ${entraExchange.accessToken}`}
            });
        } catch(e) {
          err = e;
        }

        should.not.exist(result);
        should.exist(err);
        err.status.should.be.equal(404);
        err.data?.message.should.be.equal('Exchange not found');
        should.not.exist(err.data?.exchange?.apiAccessToken);

        findStub.restore();
      });

    it('should handle expired exchange when getting status',
      async function() {
        const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves({
            ...entraExchange,
            createdAt: new Date('2023-11-14'),
            recordExpiresAt: new Date('2023-11-15')
          });
        const getExchangeStub = sinon.stub(
          BaseWorkflowService.prototype,
          'getExchange').callsFake(function(args) {
          const newArgs = {...args, allowExpired: false};
          return getExchangeStub.wrappedMethod.call(this, newArgs);
        });
        getExchangeStub.wrappedMethod =
          BaseWorkflowService.prototype.getExchange.wrappedMethod ??
          BaseWorkflowService.prototype.getExchange;
        let result;
        let err;
        try {
          result = await client
            .get(`${baseUrl}/workflows/${testWorkflow.clientId}/exchanges/` +
              `${entraExchange.id}`, {
              headers: {Authorization: `Bearer ${entraExchange.accessToken}`}
            });
        } catch(e) {
          err = e;
        }

        should.not.exist(result);
        should.exist(err);
        err.status.should.be.equal(404);
        err.data?.message.should.be.equal('Exchange not found');
        should.not.exist(err.data?.exchange?.apiAccessToken);

        findStub.restore();
        getExchangeStub.restore();
      });

    it('should update exchange status after verification with DI VP token',
      async function() {
        const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves(entraExchange);
        const replaceStub = sinon.stub(database.collections.Exchanges,
          'replaceOne').resolves();
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

        let result;
        let err;
        try {
          result = await client.post(`${baseUrl}/verification/callback`, {
            headers: {
              Authorization: `Bearer ${entraExchange.apiAccessToken}`
            },
            json: {
              requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
              requestStatus: 'presentation_verified',
              receipt: {
                vp_token: testVpToken
              }
            }});
        } catch(e) {
          err = e;
        }

        should.not.exist(err);
        result.status.should.be.equal(200);
        findStub.called.should.be.equal(true);
        replaceStub.called.should.be.equal(true);
        dateStub.called.should.be.equal(true);

        findStub.restore();
        replaceStub.restore();
        dateStub.restore();
      });

    it('should encounter auth error using wrong access token on entra callback',
      async function() {
        const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves(entraExchange);
        const updateStub = sinon.stub(database.collections.Exchanges,
          'replaceOne').resolves();
        let result;
        let err;
        try {
          result = await client
            .post(`${baseUrl}/verification/callback`, {
              // Use the wrong token (correct: entraExchange.apiAccessToken)
              headers: {Authorization: `Bearer ${entraExchange.accessToken}`},
              json: {
                requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
                requestStatus: 'presentation_verified',
                receipt: {
                  vp_token: testVpToken
                }
              }
            });
        } catch(e) {
          err = e;
        }

        // There should be an error message from the improper authentication
        should.equal(err.data?.message, 'Invalid access token');
        should.not.exist(result);
        findStub.called.should.be.equal(true);
        updateStub.called.should.be.equal(false); // It should not have updated
        findStub.restore();
        updateStub.restore();
      });

    it('should update exchange status after verification with JWT VP token',
      async function() {
        const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
          .resolves(entraExchange);
        const updateStub = sinon.stub(database.collections.Exchanges,
          'replaceOne').resolves();

        const {chain, leafKeyPair} = await generateCertificateChain({
          length: 3
        });
        const root = chain.pop();
        const caStoreStub = sinon.stub(config.opencred, 'caStore').value([
          convertDerCertificateToPem(root.raw, false)
        ]);
        const {vpToken} = await generateValidJwtVpToken({
          aud: domainToDidWeb(config.server.baseUri),
          x5c: chain.map(c => convertDerCertificateToPem(c.raw, true)),
          leafKeyPair
        });

        let result;
        let err;
        try {
          result = await client
            .post(`${baseUrl}/verification/callback`, {

              headers: {
                Authorization: `Bearer ${entraExchange.apiAccessToken}`
              },
              json: {
                requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
                requestStatus: 'presentation_verified',
                receipt: {
                  vp_token: vpToken
                }
              }
            });
        } catch(e) {
          err = e;
        }

        should.not.exist(err);
        result.status.should.be.equal(200);
        findStub.called.should.be.equal(true);
        updateStub.called.should.be.equal(true);

        caStoreStub.restore();
        findStub.restore();
        updateStub.restore();
      });

    it('should fail the exchange on presentation_error', async function() {
      const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(entraExchange);
      const updateStub = sinon.stub(database.collections.Exchanges,
        'replaceOne').resolves();

      let err;
      try {
        await client
          .post(`${baseUrl}/verification/callback`, {

            headers: {
              Authorization: `Bearer ${entraExchange.apiAccessToken}`
            },
            json: {
              requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
              requestStatus: 'presentation_error'
            }
          });
      } catch(e) {
        err = e;
      }

      should.exist(err);
      findStub.called.should.be.equal(true);
      updateStub.called.should.be.equal(true);

      const updateData = updateStub.getCalls()[0].args[1];
      should.exist(updateData);
      should.equal(updateData.state, 'invalid');
      should.equal(
        updateData.variables.results.default.errors[0],
        'Entra error: received unknown presentation error');

      findStub.restore();
      updateStub.restore();

    });

    it('should fail X.509 validation with invalid x5c chain ' +
      'after verification with JWT VP token', async () => {
      const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(entraExchange);
      const replaceStub = sinon.stub(database.collections.Exchanges,
        'replaceOne').resolves();

      const {chain} = await generateCertificateChain({
        length: 3
      });
      chain.pop();
      const {vpToken} = await generateValidJwtVpToken({
        aud: domainToDidWeb(config.server.baseUri),
        x5c: chain.map(c => convertDerCertificateToPem(c.raw, true))
      });

      let result;
      let err;
      try {
        result = await client
          .post(`${baseUrl}/verification/callback`, {
            headers: {Authorization: `Bearer ${entraExchange.apiAccessToken}`},
            json: {
              requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
              requestStatus: 'presentation_verified',
              receipt: {
                vp_token: vpToken
              }
            }
          });
      } catch(e) {
        err = e;
      }

      should.not.exist(result);
      err.status.should.be.equal(400);
      err.message.should.be.equal('Invalid certificate in x5c claim');
      findStub.called.should.be.equal(true);
      replaceStub.called.should.be.equal(true);

      findStub.restore();
      replaceStub.restore();
    });

    it('should fail X.509 validation with valid x5c chain ' +
      'and invalid did:jwk issuer after verification with JWT VP token',
    async () => {
      const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(entraExchange);
      const replaceStub = sinon.stub(database.collections.Exchanges,
        'replaceOne').resolves();

      const {vpToken} = await generateValidJwtVpToken({
        aud: domainToDidWeb(config.server.baseUri),
        x5c: [
          'MIICaDCCAg6gAwIBAgIUHOO2dIyATRbAfyt3AcBO6DHawhEwCgYIKoZIzj0E' +
          'AwIwUDELMAkGA1UEBhMCVVMxDjAMBgNVBAgMBVVTLUNBMQwwCgYDVQQKDANE' +
          'TVYxIzAhBgNVBAMMGkNhbGlmb3JuaWEgRE1WIFJvb3QgQ0EgVUFUMB4XDTI0' +
          'MDEyMzE3NDc1MFoXDTI1MDEyMjE3NDc1MFowVjELMAkGA1UEBhMCVVMxDjAM' +
          'BgNVBAgMBVVTLUNBMQwwCgYDVQQKDANETVYxKTAnBgNVBAMMIHZjIG1kbCBT' +
          'aWduZXIgQ2FsaWZvcm5pYSBETVYgVUFUMFkwEwYHKoZIzj0CAQYIKoZIzj0D' +
          'AQcDQgAEfvsjCYeH1nRBf0N4vmw4IvVAnv+j82gJmwgvI0gXdyo4DjCg5Ks1' +
          'onZ1ClIwQpubx7Mvgy6ssCQUVwWbk6fJBaOBvzCBvDAdBgNVHQ4EFgQUprYJ' +
          'EADWkvGMda2GQgbKYfTXLWYwHwYDVR0jBBgwFoAUSWhCfS8C3wEPseC28Scm' +
          'Fn0j25UwHQYJYIZIAYb4QgENBBAWDkNhbGlmb3JuaWEgRE1WMA4GA1UdDwEB' +
          '/wQEAwIHgDAdBgNVHRIEFjAUgRJleGFtcGxlQGRtdi5jYS5nb3YwLAYDVR0f' +
          'BCUwIzAhoB+gHYYbaHR0cHM6Ly9tZGxzLmRtdi5jYS5nb3YvY3JsMAoGCCqG' +
          'SM49BAMCA0gAMEUCIQCGn0U8a0sdEUY7mjB0HYOnenqBNxC2sbX0tdm/lfpX' +
          'pwIgdFTNrjOJJEYDCbzvsjh832SZlK7nk2Hcl+EncyfraYY='
        ]
      });

      let result;
      let err;
      try {
        result = await client
          .post(`${baseUrl}/verification/callback`, {
            headers: {Authorization: `Bearer ${entraExchange.apiAccessToken}`},
            json: {
              requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
              requestStatus: 'presentation_verified',
              receipt: {
                vp_token: vpToken
              }
            }
          });
      } catch(e) {
        err = e;
      }

      should.not.exist(result);
      err.status.should.be.equal(400);
      err.message.should.be.equal('Invalid certificate in x5c claim');
      findStub.called.should.be.equal(true);
      replaceStub.called.should.be.equal(true);

      findStub.restore();
      replaceStub.restore();
    });

    it('should pass X.509 validation with valid x5c chain ' +
      'after verification with JWT VP token',
    async () => {
      const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(entraExchange);
      const replaceStub = sinon.stub(database.collections.Exchanges,
        'replaceOne').resolves();

      const {chain, leafKeyPair} = await generateCertificateChain({
        length: 3
      });
      const root = chain.pop();
      const caStoreStub = sinon.stub(config.opencred, 'caStore').value([
        convertDerCertificateToPem(root.raw, false)
      ]);

      const {vpToken} = await generateValidJwtVpToken({
        aud: domainToDidWeb(config.server.baseUri),
        x5c: chain.map(c => convertDerCertificateToPem(c.raw, true)),
        leafKeyPair
      });

      let result;
      let err;
      try {
        result = await client
          .post(`${baseUrl}/verification/callback`, {
            headers: {Authorization: `Bearer ${entraExchange.apiAccessToken}`},
            json: {
              requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
              requestStatus: 'presentation_verified',
              receipt: {
                vp_token: vpToken
              }
            }
          });
      } catch(e) {
        err = e;
      }

      should.not.exist(err);
      result.status.should.be.equal(200);
      result.data.message.should.be.equal('Success');
      findStub.called.should.be.equal(true);
      replaceStub.called.should.be.equal(true);

      findStub.restore();
      replaceStub.restore();
      caStoreStub.restore();
    });

    it('should pass X.509 validation with invalid x5c chain ' +
      'if caConfig on rp is false ' +
      'after verification with JWT VP token',
    async () => {
      const findStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves(entraExchange);
      const replaceStub = sinon.stub(database.collections.Exchanges,
        'replaceOne').resolves();

      const {chain, leafKeyPair} = await generateCertificateChain({
        length: 3
      });
      const root = chain.pop();
      const caStoreStub = sinon.stub(config.opencred, 'caStore').value([
        convertDerCertificateToPem(root.raw, false)
      ]);
      const workflowsStub = sinon.stub(config.opencred, 'workflows')
        .value([{
          ...testWorkflow,
          type: 'microsoft-entra-verified-id',
          apiBaseUrl: 'https://api.entra.microsoft.example.com/v1.0',
          apiLoginBaseUrl: 'https://login.entra.microsoft.example.com',
          verifierDid: 'did:web:example.com',
          verifierName: 'Test Entra Verifier',
          initialStep: 'default',
          acceptedCredentialType: 'Iso18013DriversLicenseCredential',
          caStore: false
        }]);

      const {vpToken} = await generateValidJwtVpToken({
        aud: domainToDidWeb(config.server.baseUri),
        x5c: 'BAD',
        leafKeyPair
      });

      let result;
      let err;
      try {
        result = await client
          .post(`${baseUrl}/verification/callback`, {
            headers: {Authorization: `Bearer ${entraExchange.apiAccessToken}`},
            json: {
              requestId: 'c656dad8-a8fa-4361-baef-51af0c2e428e',
              requestStatus: 'presentation_verified',
              receipt: {
                vp_token: vpToken
              }
            }
          });
      } catch(e) {
        err = e;
      }

      should.not.exist(err);
      result.status.should.be.equal(200);
      result.data.message.should.be.equal('Success');
      findStub.called.should.be.equal(true);
      replaceStub.called.should.be.equal(true);

      findStub.restore();
      replaceStub.restore();
      caStoreStub.restore();
      workflowsStub.restore();
    });
  });
