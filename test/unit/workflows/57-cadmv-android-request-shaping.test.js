/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

// Spec-cleaning of the cadmv-android request to match the working
// verifier.multipaz.org Google Wallet request: omit client_id_scheme and drop
// dcql_query.credential_sets (cadmv-android already omits state). Kept in a
// separate file so the experiment can be removed easily once we know which
// shape Google Wallet accepts.

import {
  generateAuthorizationRequest
} from '../../../lib/workflows/profiles/native-cadmv-android.js';

import expect from 'expect.js';

const testWorkflow = {
  type: 'native',
  clientId: 'cadmv-android-test',
  description: 'Sign in with CA DMV credentials',
  query: [{
    format: ['mso_mdoc'],
    fields: {
      'org.iso.18013.5.1': ['given_name', 'family_name']
    }
  }]
};

// Reader-CA leaf (generate-reader-cert.js output). cadmv-android always signs,
// so the key must actually import; this leaf key matches leafCertPem.
const leafPrivateKeyPem = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgRfhsdJghpswcEz6T
TJ9id/HK+RYh5o3yRZcRiIeA8pChRANCAAR5XJlfJ4tSA4GnwOxrgozIO7KfdM1h
Ju1aS2yrAxw4SLlVg1VL9J9OUGKDuaqPouitdUiHBYdCVBFXeAHl9TG9
-----END PRIVATE KEY-----`;

const leafCertPem = `-----BEGIN CERTIFICATE-----
MIICPjCCAeOgAwIBAgIUSrz5CwDkO4o4Mryn6bNQQj/cPeMwCgYIKoZIzj0EAwIw
TTELMAkGA1UEBhMCVVMxCzAJBgNVBAgMAkNBMREwDwYDVQQKDAhPcGVuQ3JlZDEe
MBwGA1UEAwwVQ0EgRE1WIFRlc3QgUmVhZGVyIENBMB4XDTI2MDYxODIyNDI0MVoX
DTI3MDYxODIyNDI0MVowRTELMAkGA1UEBhMCVVMxCzAJBgNVBAgMAkNBMREwDwYD
VQQKDAhPcGVuQ3JlZDEWMBQGA1UEAwwNQ0EgRE1WIFJlYWRlcjBZMBMGByqGSM49
AgEGCCqGSM49AwEHA0IABHlcmV8ni1IDgafA7GuCjMg7sp90zWEm7VpLbKsDHDhI
uVWDVUv0n05QYoO5qo+i6K11SIcFh0JUEVd4AeX1Mb2jgagwgaUwJQYDVR0RBB4w
HIIadWF0LWNyZWRlbnRpYWxzLmRtdi5jYS5nb3YwDAYDVR0TAQH/BAIwADAOBgNV
HQ8BAf8EBAMCB4AwHgYDVR0lAQH/BBQwEgYHKIGMXQUBBgYHKIG1NAQBBjAdBgNV
HQ4EFgQUvPNfAd5QZpjTFUiczsGE74LcugYwHwYDVR0jBBgwFoAUyr7o5+hSRsS/
xV+YqierUyy4XvwwCgYIKoZIzj0EAwIDSQAwRgIhAMwYhdGlfjUTm2PZPSgWzCV+
eaYI8zhdiNumi3rhQISXAiEAljxXM6pAXQmTw4Bs9VRGdRPtXaLpbtEtkyaVf1xg
m0Q=
-----END CERTIFICATE-----`;

const signingKeys = [{
  id: 'cadmv-android-key',
  type: 'ES256',
  privateKeyPem: leafPrivateKeyPem,
  certificatePem: leafCertPem,
  purpose: ['authorization_request']
}];

function buildExchange() {
  return {id: 'ex-cadmv-android', variables: {}};
}

async function generate() {
  return generateAuthorizationRequest({
    workflow: testWorkflow,
    exchange: buildExchange(),
    baseUri: 'https://example.com',
    signingKeys,
    profile: 'cadmv-android'
  });
}

describe('native-cadmv-android request shaping', () => {
  it('uses x509_san_dns client_id but omits client_id_scheme', async () => {
    const {authorizationRequest} = await generate();
    expect(authorizationRequest.client_id).to.equal(
      'x509_san_dns:example.com');
    expect(authorizationRequest).to.not.have.property('client_id_scheme');
  });

  it('omits state', async () => {
    const {authorizationRequest} = await generate();
    expect(authorizationRequest).to.not.have.property('state');
  });

  it('drops dcql_query.credential_sets but keeps credentials', async () => {
    const {authorizationRequest} = await generate();
    expect(authorizationRequest.dcql_query).to.not.have.property(
      'credential_sets');
    expect(authorizationRequest.dcql_query.credentials).to.be.an('array');
    expect(authorizationRequest.dcql_query.credentials.length)
      .to.be.greaterThan(0);
  });

  it('produces a signed dc_api JAR envelope', async () => {
    const {authorizationRequest, dcApiRequest} = await generate();
    expect(authorizationRequest.response_mode).to.equal('dc_api');
    expect(dcApiRequest).to.be.an('object');
  });
});
