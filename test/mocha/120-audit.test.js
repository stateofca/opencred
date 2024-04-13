/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {baseUrl} from '../mock-data.js';
import {config} from '@bedrock/core';
import {database} from '../../lib/database.js';
import {domainToDidWeb} from '../../lib/didWeb.js';
import {generateValidDiVpToken} from '../utils/diVpTokens.js';
import {generateValidJwtVpToken} from '../utils/jwtVpTokens.js';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

const testRP = {
  workflow: {
    type: 'native',
    id: 'testflow',
    steps: {
      waiting: {
        verifiablePresentationRequest: '{}'
      }
    }
  }
};

describe('Audit Presentation', function() {
  this.beforeEach(() => {
    this.rpStub = sinon.stub(config.opencred, 'relyingParties').value([testRP]);
    this.enableAuditStub = sinon.stub(config.opencred, 'enableAudit')
      .value(true);
  });

  this.afterEach(() => {
    this.rpStub.restore();
    this.enableAuditStub.restore();
  });

  describe('valid JWT VP token', function() {
    it('should pass audit for single valid cached issuer DID document',
      async function() {
        const {vpToken, issuerDid} =
          await generateValidJwtVpToken({
            aud: domainToDidWeb(config.server.baseUri)});

        const findOneStub = sinon
          .stub(database.collections.DidDocumentHistory, 'findOne')
          .resolves({
            did: issuerDid,
            history: []
          });

        let response;
        let error;
        try {
          response = await client
            .post(`${baseUrl}/audit-presentation`, {
              json: {vpToken}
            });
        } catch(e) {
          error = e;
        }

        should.not.exist(error);
        should.exist(response);
        response.status.should.equal(200);
        response.data.verified.should.be.equal(true);
        response.data.message.should.be.equal('Success');
        findOneStub.restore();
      });

    it('should fail audit for issuer DID that has never been encountered',
      async function() {
        const {vpToken, issuerDid} =
          await generateValidJwtVpToken({
            aud: domainToDidWeb(config.server.baseUri)});

        const findOneStub = sinon
          .stub(database.collections.DidDocumentHistory, 'findOne')
          .resolves(null);

        let response;
        let error;
        try {
          response = await client
            .post(`${baseUrl}/audit-presentation`, {
              json: {vpToken}
            });
        } catch(e) {
          error = e;
        }

        should.not.exist(response);
        should.exist(error);
        error.status.should.equal(400);
        error.data.verified.should.be.equal(false);
        error.data.message.should.be.equal(
          `The system has never encountered issuer DID ${issuerDid}.`);
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

        let response;
        let error;
        try {
          response = await client
            .post(`${baseUrl}/audit-presentation`, {
              json: {vpToken}
            });
        } catch(e) {
          error = e;
        }

        should.not.exist(error);
        should.exist(response);
        response.status.should.equal(200);
        response.data.verified.should.be.equal(true);
        response.data.message.should.be.equal('Success');
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

        let response;
        let error;
        try {
          response = await client
            .post(`${baseUrl}/audit-presentation`, {
              json: {vpToken}
            });
        } catch(e) {
          error = e;
        }

        should.not.exist(error);
        should.exist(response);
        response.status.should.equal(200);
        response.data.verified.should.be.equal(true);
        response.data.message.should.be.equal('Success');
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

        let response;
        let error;
        try {
          response = await client
            .post(`${baseUrl}/audit-presentation`, {
              json: {vpToken}
            });
        } catch(e) {
          error = e;
        }

        should.not.exist(error);
        should.exist(response);
        response.status.should.equal(200);
        response.data.verified.should.be.equal(true);
        response.data.message.should.be.equal('Success');
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

        let response;
        let error;
        try {
          response = await client
            .post(`${baseUrl}/audit-presentation`, {
              json: {vpToken}
            });
        } catch(e) {
          error = e;
        }

        should.not.exist(response);
        should.exist(error);
        error.status.should.equal(400);
        error.data.verified.should.be.equal(false);
        error.data.message
          .should.match(/CredentialVerificationError/);
        error.data.message
          .should.match(/Safe mode validation error/);
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

        let response;
        let error;
        try {
          response = await client
            .post(`${baseUrl}/audit-presentation`, {
              json: {vpToken}
            });
        } catch(e) {
          error = e;
        }

        should.not.exist(response);
        should.exist(error);
        error.status.should.equal(400);
        error.data.verified.should.be.equal(false);
        error.data.message
          .should.be.equal(
            'The system has never encountered issuer DID ' +
            `${issuerDidsCredentials[0]}.`
          );
        resolveDidWebStub.restore();
        findOneStub.restore();
      });
  });
});
