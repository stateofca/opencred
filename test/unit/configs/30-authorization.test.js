/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {buildAuthorizationConfig} from '../../../configs/authorization.js';
import expect from 'expect.js';

const oauthCallbackWorkflow = {
  clientId: 'rp-with-oauth',
  callback: {
    url: 'https://gateway.example.com/result',
    oauth: {
      issuer: 'https://login.example.com/tenant-id/v2.0',
      tokenUrl: 'https://login.example.com/tenant-id/oauth2/v2.0/token',
      clientId: 'oauth-client-id',
      clientSecret: 'oauth-client-secret',
      scope: ['.default']
    }
  }
};

describe('buildAuthorizationConfig', () => {
  it('should map a callback.oauth block to an authorization entry', () => {
    const authorization = buildAuthorizationConfig({
      workflows: [oauthCallbackWorkflow]
    });
    expect(authorization).to.be.an('array');
    expect(authorization.length).to.be(1);
    expect(authorization[0]).to.eql({
      issuer: 'https://login.example.com/tenant-id/v2.0',
      client_id: 'oauth-client-id',
      client_secret: 'oauth-client-secret',
      token_endpoint: 'https://login.example.com/tenant-id/oauth2/v2.0/token',
      scope: ['.default'],
      pkce: false,
      protocol: 'oauth2_client_grant',
      grant_type: 'client_credentials'
    });
  });

  it('should return an empty array for workflows without callbacks', () => {
    const authorization = buildAuthorizationConfig({
      workflows: [{clientId: 'rp-no-callback'}]
    });
    expect(authorization).to.eql([]);
  });

  it('should skip callbacks that do not use oauth', () => {
    const authorization = buildAuthorizationConfig({
      workflows: [{
        clientId: 'rp-headers-only',
        callback: {
          url: 'https://gateway.example.com/result',
          headersVariable: 'callbackHeaders'
        }
      }]
    });
    expect(authorization).to.eql([]);
  });

  it('should collect entries across multiple workflows', () => {
    const other = {
      clientId: 'rp-other',
      callback: {
        url: 'https://other.example.com/result',
        oauth: {
          ...oauthCallbackWorkflow.callback.oauth,
          issuer: 'https://login.example.com/other-tenant/v2.0'
        }
      }
    };
    const authorization = buildAuthorizationConfig({
      workflows: [oauthCallbackWorkflow, {clientId: 'plain'}, other]
    });
    expect(authorization.length).to.be(2);
    expect(authorization.map(a => a.issuer)).to.eql([
      'https://login.example.com/tenant-id/v2.0',
      'https://login.example.com/other-tenant/v2.0'
    ]);
  });

  it('should return an empty array for no workflows', () => {
    expect(buildAuthorizationConfig({workflows: []})).to.eql([]);
  });
});
