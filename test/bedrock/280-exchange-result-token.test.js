/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import expect from 'expect.js';

import {
  buildExchangeResultToken,
  verifyExchangeResultToken
} from '../../lib/workflows/common.js';
import {config} from '@bedrock/core';
import {exampleKey} from '../fixtures/signingKeys.js';

describe('Exchange Result Token', () => {
  let signingKeysStub;

  afterEach(() => {
    signingKeysStub?.restore();
  });

  beforeEach(() => {
    signingKeysStub = sinon.stub(config.opencred, 'signingKeys')
      .value([{...exampleKey, purpose: ['id_token']}]);
  });

  describe('buildExchangeResultToken', () => {
    it('should produce a valid JWT', async () => {
      const token = await buildExchangeResultToken({
        exchangeId: 'ex-123',
        workflowId: 'wf-456',
        procedurePath: 'login'
      });
      expect(token).to.be.a('string');
      expect(token.split('.')).to.have.length(3);
    });
  });

  describe('verifyExchangeResultToken', () => {
    it('should validate and extract payload', async () => {
      const token = await buildExchangeResultToken({
        exchangeId: 'ex-123',
        workflowId: 'wf-456',
        procedurePath: 'login'
      });
      const payload = await verifyExchangeResultToken(token);
      expect(payload).to.eql({
        exchangeId: 'ex-123',
        workflowId: 'wf-456',
        procedurePath: 'login'
      });
    });

    it('should throw on invalid token', async () => {
      let err;
      try {
        await verifyExchangeResultToken('invalid.jwt.token');
      } catch(e) {
        err = e;
      }
      expect(err).to.be.an(Error);
    });

    it('should throw on expired token', async () => {
      const {SignJWT} = await import('jose');
      const {importPKCS8} = await import('jose');
      const privateKey = await importPKCS8(
        exampleKey.privateKeyPem, exampleKey.type);
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = await new SignJWT({
        exchangeId: 'ex-1',
        workflowId: 'wf-1',
        procedurePath: 'verification'
      })
        .setProtectedHeader({alg: exampleKey.type, typ: 'JWT'})
        .setIssuedAt(now - 7200)
        .setExpirationTime(now - 3600)
        .sign(privateKey);

      let err;
      try {
        await verifyExchangeResultToken(expiredToken);
      } catch(e) {
        err = e;
      }
      expect(err).to.be.an(Error);
      expect(err.message).to.match(/expired|exp.*claim/i);
    });

    it('should throw when token has missing required claims', async () => {
      const {SignJWT} = await import('jose');
      const {importPKCS8} = await import('jose');
      const privateKey = await importPKCS8(
        exampleKey.privateKeyPem, exampleKey.type);
      const badToken = await new SignJWT({
        exchangeId: 'ex-1'
      })
        .setProtectedHeader({alg: exampleKey.type, typ: 'JWT'})
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(privateKey);

      let err;
      try {
        await verifyExchangeResultToken(badToken);
      } catch(e) {
        err = e;
      }
      expect(err).to.be.an(Error);
      expect(err.message).to.contain('missing required claims');
    });
  });
});
