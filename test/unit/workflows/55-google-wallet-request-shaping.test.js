/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

// Experimental request-shaping knobs for the google-wallet (x509_hash)
// profile (options.googleWalletRequest). Kept in a separate file so the
// experiments can be removed easily once we know which shape Google Wallet
// accepts.

import {config} from '@bedrock/core';
import {
  generateAuthorizationRequest
} from '../../../lib/workflows/profiles/native-google-wallet.js';
import {
  googleWalletTestEntry
} from '../../fixtures/wallet-certificates.js';

import expect from 'expect.js';

const testWorkflow = {
  type: 'native',
  clientId: 'gw-test',
  description: 'Sign in with CA DMV credentials',
  query: [{
    format: ['mso_mdoc'],
    fields: {
      'org.iso.18013.5.1': ['given_name', 'family_name']
    }
  }]
};

function buildExchange() {
  return {id: 'ex-shaping', variables: {}};
}

describe('native-google-wallet request shaping', () => {
  let prevOpencred;
  let prevServer;

  beforeEach(() => {
    prevOpencred = config.opencred;
    prevServer = config.server;
    config.opencred = {
      ...prevOpencred,
      walletCertificates: [googleWalletTestEntry],
      options: {...(prevOpencred?.options ?? {})}
    };
    config.server = {
      ...prevServer,
      baseUri: 'https://example.com'
    };
  });

  afterEach(() => {
    config.opencred = prevOpencred;
    config.server = prevServer;
  });

  it('omits client_id_scheme regardless of knobs', async () => {
    const {authorizationRequest} = await generateAuthorizationRequest({
      workflow: testWorkflow,
      exchange: buildExchange(),
      profile: 'google-wallet'
    });
    expect(authorizationRequest.client_id).to.match(/^x509_hash:/);
    expect(authorizationRequest).to.not.have.property('client_id_scheme');
  });

  it('default knobs preserve encrypted dc_api.jwt shape', async () => {
    const {authorizationRequest, updatedExchange} =
      await generateAuthorizationRequest({
        workflow: testWorkflow,
        exchange: buildExchange(),
        profile: 'google-wallet'
      });
    expect(authorizationRequest.response_mode).to.equal('dc_api.jwt');
    expect(authorizationRequest.state).to.be.a('string');
    expect(authorizationRequest.dcql_query.credential_sets).to.be.an('array');
    expect(authorizationRequest.client_metadata.jwks).to.be.an('object');
    expect(updatedExchange.variables.ephemeralKeyAgreementPrivateKey)
      .to.be.ok();
    expect(updatedExchange.variables.ephemeralKeyAgreementPublicKey)
      .to.be.ok();
    expect(updatedExchange.variables.encodedSessionTranscript).to.be.ok();
  });

  it('omitState removes state', async () => {
    config.opencred.options.googleWalletRequest = {omitState: true};
    const {authorizationRequest} = await generateAuthorizationRequest({
      workflow: testWorkflow,
      exchange: buildExchange(),
      profile: 'google-wallet'
    });
    expect(authorizationRequest).to.not.have.property('state');
  });

  it('omitCredentialSets removes credential_sets but keeps credentials',
    async () => {
      config.opencred.options.googleWalletRequest = {
        omitCredentialSets: true
      };
      const {authorizationRequest} = await generateAuthorizationRequest({
        workflow: testWorkflow,
        exchange: buildExchange(),
        profile: 'google-wallet'
      });
      expect(authorizationRequest.dcql_query).to.not.have.property(
        'credential_sets');
      expect(authorizationRequest.dcql_query.credentials).to.be.an('array');
      expect(authorizationRequest.dcql_query.credentials.length)
        .to.be.greaterThan(0);
    });

  it('responseMode dc_api produces unencrypted shape', async () => {
    config.opencred.options.googleWalletRequest = {responseMode: 'dc_api'};
    const {authorizationRequest, updatedExchange} =
      await generateAuthorizationRequest({
        workflow: testWorkflow,
        exchange: buildExchange(),
        profile: 'google-wallet'
      });
    expect(authorizationRequest.response_mode).to.equal('dc_api');
    expect(authorizationRequest.client_metadata).to.not.have.property('jwks');
    expect(updatedExchange.variables).to.not.have.property(
      'ephemeralKeyAgreementPrivateKey');
    expect(updatedExchange.variables).to.not.have.property(
      'ephemeralKeyAgreementPublicKey');
    expect(updatedExchange.variables.encodedSessionTranscript).to.be.ok();
  });
});
