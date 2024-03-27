/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import expect from 'expect.js';
import fs from 'node:fs';
import {klona} from 'klona';

import {
  createNativeExchange, verifySubmission
} from '../../lib/exchanges/native.js';
import {config} from '@bedrock/core';
import {database} from '../../lib/database.js';
import {getDocumentLoader} from '../../common/documentLoader.js';
import {verifyUtils} from '../../common/utils.js';

const rp = {
  workflow: {
    type: 'native'
  },
  domain: 'http://example.test.com'
};

describe('Exchanges (Native)', async () => {
  let vp_token;
  let presentation_submission;
  let exchange;
  let verifyStub;
  let verifyCredentialStub;
  let dbStub;
  let isAuditEnabledStub;

  before(() => {
    const oid4vp = JSON.parse(fs.readFileSync(
      './test/fixtures/oid4vp_di.json'));
    vp_token = oid4vp.vp_token;
    presentation_submission = oid4vp.presentation_submission;
    exchange = JSON.parse(fs.readFileSync(
      './test/fixtures/exchange.json'));
    exchange.createdAt = new Date(exchange.createdAt);
    exchange.recordExpiresAt = new Date(exchange.recordExpiresAt);
    dbStub = sinon.stub(database.collections.Exchanges, 'insertOne')
      .resolves({insertedId: 'test'});
    sinon.stub(getDocumentLoader(), 'build')
      .returns(() => {
        return Promise.resolve({/* mock resolved value */});
      });
    verifyStub = sinon.stub(verifyUtils, 'verifyPresentationDataIntegrity')
      .resolves({verified: true});
    verifyCredentialStub = sinon.stub(
      verifyUtils, 'verifyCredentialDataIntegrity')
      .resolves({verified: true});
    isAuditEnabledStub = sinon.stub(config.opencred, 'isAuditEnabled')
      .returns(false);
  });

  after(() => {
    sinon.restore();
  });

  it('should set req.exchange for native workflow in createNativeExchange',
    async () => {
      const next = sinon.spy();
      const req = {rp, query: {state: 'test'}};

      await createNativeExchange(req, null, next);
      expect(next).to.have.property('called');
      expect(req).to.have.property('exchange');
      expect(req.exchange).to.have.property('vcapi');
      expect(req.exchange).to.have.property('OID4VP');
      expect(req.exchange).to.have.property('id');
      expect(dbStub.called).to.be.true;
    });

  it('should not set req.exchange for vc-api workflow in createNativeExchange',
    async () => {
      const next = sinon.spy();
      const req = klona({rp, query: {state: 'test'}});
      req.rp.workflow.type = 'vc-api';
      await createNativeExchange(req, null, next);
      expect(next).to.have.property('called');
      expect(req).to.not.have.property('exchange');
    });

  it('should get the correct exchange data', async () => {
    const next = sinon.spy();
    const req = {rp, query: {state: 'test'}};
    await createNativeExchange(req, null, next);
    expect(next).to.have.property('called');
    expect(req).to.have.property('exchange');
    expect(req.exchange).to.have.property('vcapi');
    expect(req.exchange).to.have.property('OID4VP');
    expect(req.exchange).to.have.property('id');
  });

  it('should verify a submission and return verified true', async () => {
    const result = await verifySubmission(
      vp_token, presentation_submission, exchange
    );

    expect(verifyStub.called).to.be.true;
    expect(verifyCredentialStub.called).to.be.true;
    expect(result.verified).to.be.true;
    expect(result.errors.length).to.be(0);
  });

  it('should require x5c in submission if CA Store in config', async () => {
    const oid4vpJWT = JSON.parse(fs.readFileSync(
      './test/fixtures/oid4vp_jwt.json'));
    const verifyUtilsStub = sinon.stub(verifyUtils, 'verifyPresentationJWT')
      .resolves({
        verified: true,
        verifiablePresentation: {vc: {proof: {jwt: '...'}}}}
      );
    const verifyUtilsStub2 = sinon.stub(verifyUtils, 'verifyCredentialJWT')
      .resolves({verified: true, signer: {}});
    const updateStub = sinon.stub(database.collections.Exchanges, 'updateOne')
      .resolves();
    const vp_token_jwt = oid4vpJWT.vp_token;
    const presentation_submission_jwt = oid4vpJWT.presentation_submission;

    const result = await verifySubmission(
      vp_token_jwt, presentation_submission_jwt, exchange
    );

    expect(verifyStub.called).to.be.true;
    expect(verifyCredentialStub.called).to.be.true;
    expect(result.verified).to.be.false;
    expect(result.errors.length).to.be(1);

    updateStub.restore();
    verifyUtilsStub.restore();
    verifyUtilsStub2.restore();
  });

  it('should return an error if definition_id does not match', async () => {
    presentation_submission.definition_id = 'incorrect';
    const result = await verifySubmission(
      vp_token, presentation_submission, exchange
    );

    expect(verifyStub.called).to.be.false;
    expect(verifyCredentialStub.called).to.be.false;
    expect(result.verified).to.be.false;
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it('should return an error if vp invalid', async () => {
    verifyStub.restore();
    verifyStub = sinon.stub(verifyUtils, 'verifyPresentationDataIntegrity')
      .resolves({verified: false, error: 'invalid vp'});
    const result = await verifySubmission(
      vp_token, presentation_submission, exchange
    );

    expect(verifyStub.called).to.be.true;
    expect(verifyCredentialStub.called).to.be.false;
    expect(result.verified).to.be.false;
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it('should return an error if vc invalid', async () => {
    verifyCredentialStub.restore();
    verifyCredentialStub = sinon.stub(
      verifyUtils, 'verifyCredentialDataIntegrity')
      .resolves({verified: false, error: 'invalid vc'});
    const result = await verifySubmission(
      vp_token, presentation_submission, exchange
    );

    expect(verifyStub.called).to.be.true;
    expect(verifyCredentialStub.called).to.be.true;
    expect(result.verified).to.be.false;
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it('should return an error if vc fails challenge', async () => {
    verifyStub.restore();
    const result = await verifySubmission(
      vp_token, presentation_submission, {
        ...exchange,
        challenge: `incorrect`
      }
    );

    expect(result.verified).to.be.false;
    expect(result.errors.length).to.be.greaterThan(0);
  });
});
