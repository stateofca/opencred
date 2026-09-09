/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/*
 * Regression test for OIDC `nonce` support in `jwtFromExchange`
 * (common/oidc.js). The request `nonce`, captured onto `exchange.oidc.nonce`,
 * must be echoed into the id_token payload when present (and omitted when
 * absent). Without it, standards-compliant RPs reject the id_token (IDX21320).
 */
import {config} from '@bedrock/core';
import crypto from 'node:crypto';
import expect from 'expect.js';
import {jwtFromExchange} from '../../common/oidc.js';

const SIGNING_KEY_ID = 'test-id-token-key';
const BASE_URI = 'https://verifier.example.gov';
const CLIENT_ID = 'test-oidc-client';

function buildExchange({nonce} = {}) {
  const credential = {
    id: 'did:example:subject',
    credentialSubject: {id: 'did:example:subject', userEmail: 'a@b.com'}
  };
  return {
    step: 'step1',
    oidc: {...(nonce !== undefined ? {nonce} : {})},
    variables: {
      results: {
        step1: {
          verifiablePresentation: {verifiableCredential: [credential]}
        }
      }
    }
  };
}

const workflow = {
  clientId: CLIENT_ID,
  oidc: {claims: [{name: 'email', path: 'userEmail'}]}
};

function decodeJwtPayload(jwt) {
  const [, payloadB64] = jwt.split('.');
  return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
}

describe('jwtFromExchange (OIDC nonce echo)', () => {
  before(() => {
    // Throwaway P-256 (ES256) signing key so jwtFromExchange can sign.
    const {privateKey} = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256'
    });
    const privateKeyPem = privateKey.export({type: 'pkcs8', format: 'pem'});
    config.server = config.server ?? {};
    config.server.baseUri = BASE_URI;
    config.opencred = config.opencred ?? {};
    config.opencred.signingKeys = [{
      type: 'ES256',
      id: SIGNING_KEY_ID,
      privateKeyPem,
      purpose: ['authorization_request', 'id_token']
    }];
  });

  it('echoes the OIDC nonce into the id_token when present', async () => {
    const jwt = await jwtFromExchange(
      buildExchange({nonce: 'nonce-abc-123'}), workflow);
    const payload = decodeJwtPayload(jwt);
    expect(payload.nonce).to.equal('nonce-abc-123');
  });

  it('omits nonce from the id_token when not on the exchange', async () => {
    const jwt = await jwtFromExchange(buildExchange(), workflow);
    const payload = decodeJwtPayload(jwt);
    expect(payload).to.not.have.property('nonce');
  });
});
