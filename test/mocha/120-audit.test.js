import * as sinon from 'sinon';
import {describe, it} from 'mocha';
import expect from 'expect.js';
import request from 'supertest';

import {app} from '../app.js';
import {config} from '@bedrock/core';
import {database} from '../../lib/database.js';
import {generateValidDiVpToken} from './utils/diVpTokens.js';
import {generateValidJwtVpToken} from './utils/jwtVpTokens.js';
import {httpClient} from '@digitalbazaar/http-client';

const testRP = {
  clientId: 'testid',
  clientSecret: 'testsecret',
  workflow: {
    type: 'native',
    id: 'testflow',
    steps: {
      waiting: {
        verifiablePresentationRequest: '{}'
      }
    }
  },
  enableAudit: true
};

describe('Audit Presentation', function() {
  this.beforeEach(() => {
    this.rpStub = sinon.stub(config, 'relyingParties').value([testRP]);
    this.isAuditEnabledStub = sinon.stub(config, 'isAuditEnabled')
      .returns(true);
  });

  this.afterEach(() => {
    this.rpStub.restore();
    this.isAuditEnabledStub.restore();
  });

  describe('valid JWT VP token', function() {
    it('should pass audit for single valid cached issuer DID document',
      async function() {
        const {vpToken, issuerDid} =
          await generateValidJwtVpToken({aud: 'did:web:localhost:8080'});

        const findOneStub = sinon
          .stub(database.collections.DidDocumentHistory, 'findOne')
          .resolves({
            did: issuerDid,
            history: []
          });

        const response = await request(app)
          .post('/workflows/testflow/audit-presentation')
          .set(
            'Authorization', `Basic ${Buffer.from('testid:testsecret')
              .toString('base64')}`
          )
          .send({vpToken})
          .set('Accept', 'application/json');

        expect(response.headers['content-type']).to.match(/json/);
        expect(response.status).to.equal(200);
        expect(response.body.verified).to.be(true);
        expect(response.body.message).to.equal('Success');
        findOneStub.restore();
      });

    it('should fail audit for issuer DID that has never been encountered',
      async function() {
        const {vpToken, issuerDid} =
          await generateValidJwtVpToken({aud: 'did:web:localhost:8080'});

        const findOneStub = sinon
          .stub(database.collections.DidDocumentHistory, 'findOne')
          .resolves(null);

        const response = await request(app)
          .post('/workflows/testflow/audit-presentation')
          .set(
            'Authorization', `Basic ${Buffer.from('testid:testsecret')
              .toString('base64')}`
          )
          .send({vpToken})
          .set('Accept', 'application/json');

        expect(response.headers['content-type']).to.match(/json/);
        expect(response.status).to.equal(400);
        expect(response.body.verified).to.be(false);
        expect(response.body.message).to.equal(
          `The system has never encountered issuer DID ${issuerDid}.`);
        findOneStub.restore();
      });

    it('should fail audit for unauthorized client',
      async function() {
        const {vpToken, issuerDid} =
          await generateValidJwtVpToken({aud: 'did:web:localhost:8080'});

        const findOneStub = sinon
          .stub(database.collections.DidDocumentHistory, 'findOne')
          .resolves({
            did: issuerDid,
            history: []
          });

        const response = await request(app)
          .post('/workflows/testflow/audit-presentation')
          .set(
            'Authorization', `Basic ${Buffer.from('testid:badtestsecret')
              .toString('base64')}`
          )
          .send({vpToken})
          .set('Accept', 'application/json');

        expect(response.headers['content-type']).to.match(/json/);
        expect(response.status).to.equal(401);
        expect(response.body.message)
          .to.equal('Malformed token or invalid clientId or clientSecret');
        findOneStub.restore();
      });
  });

  describe('valid DI VP token', function() {
    it('should pass audit for single valid cached issuer DID document',
      async function() {
        const didWebUrlCredentials = ['https://example-cred-1.edu'];
        const numberOfCredentials = 1;
        const {
          vpToken,
          issuerDidsCredentials,
          issuerDidDocumentsCredentials,
          issuerIssuanceDatesCredentials
        } = await generateValidDiVpToken({
          didWebUrlCredentials, numberOfCredentials});

        const resolveDidWebStub = sinon.stub(httpClient, 'get');
        resolveDidWebStub
          .withArgs('https://example-cred-1.edu/.well-known/did.json')
          .returns({data: issuerDidDocumentsCredentials[0]});

        const findOneStub = sinon
          .stub(database.collections.DidDocumentHistory, 'findOne')
          .resolves({
            did: issuerDidsCredentials[0],
            history: [
              {
                validFrom: issuerIssuanceDatesCredentials[0],
                validUntil: null,
                didDocument: issuerDidDocumentsCredentials[0]
              }
            ]
          });

        const response = await request(app)
          .post('/workflows/testflow/audit-presentation')
          .set(
            'Authorization', `Basic ${Buffer.from('testid:testsecret')
              .toString('base64')}`
          )
          .send({vpToken})
          .set('Accept', 'application/json');

        expect(response.headers['content-type']).to.match(/json/);
        expect(response.status).to.equal(200);
        expect(response.body.verified).to.be(true);
        expect(response.body.message).to.equal('Success');
        resolveDidWebStub.restore();
        findOneStub.restore();
      });

    it('should pass audit for multiple valid cached issuer DID documents',
      async function() {
        const didWebUrlCredentials = ['https://example-cred-1.edu'];
        const numberOfCredentials = 1;
        const {
          vpToken,
          issuerDidsCredentials,
          issuerDidDocumentsCredentials,
          issuerIssuanceDatesCredentials
        } = await generateValidDiVpToken({
          didWebUrlCredentials, numberOfCredentials});

        const resolveDidWebStub = sinon.stub(httpClient, 'get');
        resolveDidWebStub
          .withArgs('https://example-cred-1.edu/.well-known/did.json')
          .returns({data: issuerDidDocumentsCredentials[0]});

        const issuanceWindowFromDate = new Date(
          issuerIssuanceDatesCredentials[0].getFullYear() - 1,
          issuerIssuanceDatesCredentials[0].getMonth(),
          issuerIssuanceDatesCredentials[0].getDate()
        );
        const issuanceWindowUntilDate = new Date(
          issuanceWindowFromDate.getFullYear() + 4,
          issuanceWindowFromDate.getMonth(),
          issuanceWindowFromDate.getDate()
        );
        const firstWindowFromDate = new Date(
          issuanceWindowFromDate.getFullYear() - 10,
          issuanceWindowFromDate.getMonth(),
          issuanceWindowFromDate.getDate()
        );
        const firstWindowUntilDate = new Date(
          firstWindowFromDate.getFullYear() + 4,
          issuanceWindowFromDate.getMonth(),
          issuanceWindowFromDate.getDate()
        );
        const secondWindowFromDate = new Date(
          firstWindowUntilDate.getFullYear() + 1,
          issuanceWindowFromDate.getMonth(),
          issuanceWindowFromDate.getDate()
        );
        const secondWindowUntilDate = new Date(
          secondWindowFromDate.getFullYear() + 4,
          issuanceWindowFromDate.getMonth(),
          issuanceWindowFromDate.getDate()
        );
        const latestWindowFromDate = new Date(
          issuanceWindowUntilDate.getFullYear() + 1,
          issuanceWindowFromDate.getMonth(),
          issuanceWindowFromDate.getDate()
        );

        const findOneStub = sinon
          .stub(database.collections.DidDocumentHistory, 'findOne')
          .resolves({
            did: issuerDidsCredentials[0],
            history: [
              {
                validFrom: firstWindowFromDate,
                validUntil: firstWindowUntilDate,
                didDocument: {}
              },
              {
                validFrom: secondWindowFromDate,
                validUntil: secondWindowUntilDate,
                didDocument: {}
              },
              {
                validFrom: issuanceWindowFromDate,
                validUntil: issuanceWindowUntilDate,
                didDocument: issuerDidDocumentsCredentials[0]
              },
              {
                validFrom: latestWindowFromDate,
                validUntil: null,
                didDocument: {}
              }
            ]
          });

        const response = await request(app)
          .post('/workflows/testflow/audit-presentation')
          .set(
            'Authorization', `Basic ${Buffer.from('testid:testsecret')
              .toString('base64')}`
          )
          .send({vpToken})
          .set('Accept', 'application/json');

        expect(response.headers['content-type']).to.match(/json/);
        expect(response.status).to.equal(200);
        expect(response.body.verified).to.be(true);
        expect(response.body.message).to.equal('Success');
        resolveDidWebStub.restore();
        findOneStub.restore();
      });

    it('should pass audit for valid multi-issuer cached issuer vp token',
      async function() {
        const didWebUrlCredentials = [
          'https://example-cred-1.edu',
          'https://example-cred-2.edu'
        ];
        const numberOfCredentials = 2;
        const {
          vpToken,
          issuerDidsCredentials,
          issuerDidDocumentsCredentials,
          issuerIssuanceDatesCredentials
        } = await generateValidDiVpToken({
          didWebUrlCredentials, numberOfCredentials});

        const resolveDidWebStub = sinon.stub(httpClient, 'get');
        resolveDidWebStub
          .withArgs('https://example-cred-1.edu/.well-known/did.json')
          .returns({data: issuerDidDocumentsCredentials[0]});
        resolveDidWebStub
          .withArgs('https://example-cred-2.edu/.well-known/did.json')
          .returns({data: issuerDidDocumentsCredentials[1]});

        const findOneStub = sinon
          .stub(database.collections.DidDocumentHistory, 'findOne');
        findOneStub
          .withArgs({did: issuerDidsCredentials[0]})
          .resolves({
            did: issuerDidsCredentials[0],
            history: [
              {
                validFrom: issuerIssuanceDatesCredentials[0],
                validUntil: null,
                didDocument: issuerDidDocumentsCredentials[0]
              }
            ]
          });
        findOneStub
          .withArgs({did: issuerDidsCredentials[1]})
          .resolves({
            did: issuerDidsCredentials[1],
            history: [
              {
                validFrom: issuerIssuanceDatesCredentials[1],
                validUntil: null,
                didDocument: issuerDidDocumentsCredentials[1]
              }
            ]
          });

        const response = await request(app)
          .post('/workflows/testflow/audit-presentation')
          .set(
            'Authorization', `Basic ${Buffer.from('testid:testsecret')
              .toString('base64')}`
          )
          .send({vpToken})
          .set('Accept', 'application/json');

        expect(response.headers['content-type']).to.match(/json/);
        expect(response.status).to.equal(200);
        expect(response.body.verified).to.be(true);
        expect(response.body.message).to.equal('Success');
        resolveDidWebStub.restore();
        findOneStub.restore();
      });

    it('should fail audit for invalid cached issuer DID document',
      async function() {
        const didWebUrlCredentials = ['https://example-cred-1.edu'];
        const numberOfCredentials = 1;
        const {
          vpToken,
          issuerDidsCredentials,
          issuerDidDocumentsCredentials,
          issuerIssuanceDatesCredentials
        } = await generateValidDiVpToken({
          didWebUrlCredentials, numberOfCredentials});

        const resolveDidWebStub = sinon.stub(httpClient, 'get');
        resolveDidWebStub
          .withArgs('https://example-cred-1.edu/.well-known/did.json')
          .returns({data: issuerDidDocumentsCredentials[0]});

        const issuanceWindowFromDate = new Date(
          issuerIssuanceDatesCredentials[0].getFullYear() - 1,
          issuerIssuanceDatesCredentials[0].getMonth(),
          issuerIssuanceDatesCredentials[0].getDate()
        );
        const firstWindowFromDate = new Date(
          issuanceWindowFromDate.getFullYear() - 5,
          issuanceWindowFromDate.getMonth(),
          issuanceWindowFromDate.getDate()
        );
        const firstWindowUntilDate = new Date(
          firstWindowFromDate.getFullYear() + 4,
          issuanceWindowFromDate.getMonth(),
          issuanceWindowFromDate.getDate()
        );

        const findOneStub = sinon
          .stub(database.collections.DidDocumentHistory, 'findOne')
          .resolves({
            did: issuerDidsCredentials[0],
            history: [
              {
                validFrom: firstWindowFromDate,
                validUntil: firstWindowUntilDate,
                didDocument: {}
              },
              {
                validFrom: issuanceWindowFromDate,
                validUntil: null,
                didDocument: {}
              }
            ]
          });

        const response = await request(app)
          .post('/workflows/testflow/audit-presentation')
          .set(
            'Authorization', `Basic ${Buffer.from('testid:testsecret')
              .toString('base64')}`
          )
          .send({vpToken})
          .set('Accept', 'application/json');

        expect(response.headers['content-type']).to.match(/json/);
        expect(response.status).to.equal(400);
        expect(response.body.verified).to.be(false);
        expect(response.body.message
          .includes('CredentialVerificationError')).to.be(true);
        expect(response.body.message
          .includes('Safe mode validation error')).to.be(true);
        resolveDidWebStub.restore();
        findOneStub.restore();
      });

    it('should fail audit for issuer DID that has never been encountered',
      async function() {
        const didWebUrlCredentials = ['https://example-cred-1.edu'];
        const numberOfCredentials = 1;
        const {
          vpToken,
          issuerDidsCredentials,
          issuerDidDocumentsCredentials
        } = await generateValidDiVpToken({
          didWebUrlCredentials, numberOfCredentials});

        const resolveDidWebStub = sinon.stub(httpClient, 'get');
        resolveDidWebStub
          .withArgs('https://example-cred-1.edu/.well-known/did.json')
          .returns({data: issuerDidDocumentsCredentials[0]});

        const findOneStub = sinon
          .stub(database.collections.DidDocumentHistory, 'findOne')
          .resolves(null);

        const response = await request(app)
          .post('/workflows/testflow/audit-presentation')
          .set(
            'Authorization', `Basic ${Buffer.from('testid:testsecret')
              .toString('base64')}`
          )
          .send({vpToken})
          .set('Accept', 'application/json');

        expect(response.headers['content-type']).to.match(/json/);
        expect(response.status).to.equal(400);
        expect(response.body.verified).to.be(false);
        expect(response.body.message).to.equal(
          'The system has never encountered issuer DID ' +
          `${issuerDidsCredentials[0]}.`);
        resolveDidWebStub.restore();
        findOneStub.restore();
      });

    it('should fail audit for unauthorized client',
      async function() {
        const didWebUrlCredentials = ['https://example-cred-1.edu'];
        const numberOfCredentials = 1;
        const {
          vpToken,
          issuerDidsCredentials,
          issuerDidDocumentsCredentials,
          issuerIssuanceDatesCredentials
        } = await generateValidDiVpToken({
          didWebUrlCredentials, numberOfCredentials});

        const resolveDidWebStub = sinon.stub(httpClient, 'get');
        resolveDidWebStub
          .withArgs('https://example-cred-1.edu/.well-known/did.json')
          .returns({data: issuerDidDocumentsCredentials[0]});

        const findOneStub = sinon
          .stub(database.collections.DidDocumentHistory, 'findOne')
          .resolves({
            did: issuerDidsCredentials[0],
            history: [
              {
                validFrom: issuerIssuanceDatesCredentials[0],
                validUntil: null,
                didDocument: issuerDidDocumentsCredentials[0]
              }
            ]
          });

        const response = await request(app)
          .post('/workflows/testflow/audit-presentation')
          .set(
            'Authorization', `Basic ${Buffer.from('testid:badtestsecret')
              .toString('base64')}`
          )
          .send({vpToken})
          .set('Accept', 'application/json');

        expect(response.headers['content-type']).to.match(/json/);
        expect(response.status).to.equal(401);
        expect(response.body.message)
          .to.equal('Malformed token or invalid clientId or clientSecret');
        resolveDidWebStub.restore();
        findOneStub.restore();
      });
  });
});
