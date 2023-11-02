import {afterEach, beforeEach, describe, it} from 'mocha';

import * as sinon from 'sinon';
import expect from 'expect.js';
import fs from 'node:fs';
import {klona} from 'klona';

import {
  createNativeExchange, verifySubmission
} from '../controllers/exchanges/native.js';
import {exchanges} from '../common/database.js';
import {getDocumentLoader} from '../common/documentLoader.js';
import {verifyUtils} from '../common/utils.js';

const rp = {
  workflow: {
    type: 'native'
  },
  domain: 'http://example.test.com'
};

describe.only('Exchanges (Native)', async () => {
  let vp_token;
  let submission;
  let exchange;
  let verifyStub;
  let verifyCredentialStub;
  let dbStub;

  beforeEach(() => {
    vp_token = JSON.parse(fs.readFileSync(
      './tests/fixtures/vp_token.json'));
    submission = JSON.parse(fs.readFileSync(
      './tests/fixtures/submission.json'));
    exchange = JSON.parse(fs.readFileSync(
      './tests/fixtures/exchange.json'));
    dbStub = sinon.stub(exchanges, 'insertOne')
      .resolves({insertedId: 'test'});
    sinon.stub(getDocumentLoader(), 'build')
      .returns(() => {
        return Promise.resolve({/* mock resolved value */});
      });
    verifyStub = sinon.stub(verifyUtils, 'verify').resolves({verified: true});
    verifyCredentialStub = sinon.stub(verifyUtils, 'verifyCredential')
      .resolves({verified: true});
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should set req.exchange for native workflow in createNativeExchange',
    async () => {
      const next = sinon.spy();
      const req = {rp};

      await createNativeExchange(req, null, next);
      expect(next).to.have.property('called');
      expect(req).to.have.property('exchange');
      expect(req.exchange).to.have.property('vcapi');
      expect(req.exchange).to.have.property('OID4VP');
      expect(req.exchange).to.have.property('exchangeId');
      expect(dbStub.called).to.be.true;
    });
  it('should not set req.exchange for vc-api workflow in createNativeExchange',
    async () => {
      const next = sinon.spy();
      const req = klona({rp});
      req.rp.workflow.type = 'vc-api';
      await createNativeExchange(req, null, next);
      expect(next).to.have.property('called');
      expect(req).to.not.have.property('exchange');
    });

  it('should get the correct exchange data', async () => {
    const next = sinon.spy();
    const req = {rp};
    await createNativeExchange(req, null, next);
    expect(next).to.have.property('called');
    expect(req).to.have.property('exchange');
    expect(req.exchange).to.have.property('vcapi');
    expect(req.exchange).to.have.property('OID4VP');
    expect(req.exchange).to.have.property('exchangeId');
  });

  it('should verify a submission and return verified true', async () => {
    const result = await verifySubmission(vp_token, submission, exchange);

    expect(verifyStub.called).to.be.true;
    expect(verifyCredentialStub.called).to.be.true;
    expect(result.verified).to.be.true;
    expect(result.errors.length).to.be(0);
  });

  it('should return an error if definition_id does not match', async () => {
    submission.definition_id = 'incorrect';
    const result = await verifySubmission(vp_token, submission, exchange);

    expect(verifyStub.called).to.be.false;
    expect(verifyCredentialStub.called).to.be.false;
    expect(result.verified).to.be.false;
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it('should return an error if vp invalid', async () => {
    verifyStub.restore();
    verifyStub = sinon.stub(verifyUtils, 'verify')
      .resolves({verified: false, error: 'invalid vp'});
    const result = await verifySubmission(vp_token, submission, exchange);

    expect(verifyStub.called).to.be.true;
    expect(verifyCredentialStub.called).to.be.false;
    expect(result.verified).to.be.false;
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it('should return an error if vc invalid', async () => {
    verifyCredentialStub.restore();
    verifyCredentialStub = sinon.stub(verifyUtils, 'verifyCredential')
      .resolves({verified: false, error: 'invalid vc'});
    const result = await verifySubmission(vp_token, submission, exchange);

    expect(verifyStub.called).to.be.true;
    expect(verifyCredentialStub.called).to.be.true;
    expect(result.verified).to.be.false;
    expect(result.errors.length).to.be.greaterThan(0);
  });
});

