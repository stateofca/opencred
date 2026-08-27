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

  // The tests below document the current contract for edge cases raised in
  // review. The builder performs no validation or deduplication; the
  // consumer (lib/callback.js) resolves an issuer to the FIRST matching
  // entry in workflow order. Stricter handling (startup validation) is
  // deliberately deferred to a follow-up.

  it('should emit duplicate issuers in workflow order (first wins)', () => {
    const sameIssuerOther = {
      clientId: 'rp-same-issuer',
      callback: {
        url: 'https://other.example.com/result',
        oauth: {
          ...oauthCallbackWorkflow.callback.oauth,
          clientId: 'other-client-id',
          clientSecret: 'other-client-secret'
        }
      }
    };
    const authorization = buildAuthorizationConfig({
      workflows: [oauthCallbackWorkflow, sameIssuerOther]
    });
    expect(authorization.length).to.be(2);
    expect(authorization[0].issuer).to.be(authorization[1].issuer);
    // the consumer's `.find()` by issuer resolves to the first entry
    const resolved = authorization.find(
      a => a.issuer === oauthCallbackWorkflow.callback.oauth.issuer);
    expect(resolved.client_id).to.be('oauth-client-id');
  });

  it('should emit an entry even when oauth has no issuer', () => {
    const noIssuer = {
      clientId: 'rp-no-issuer',
      callback: {
        url: 'https://gateway.example.com/result',
        oauth: {
          tokenUrl: 'https://login.example.com/tenant-id/oauth2/v2.0/token',
          clientId: 'oauth-client-id',
          clientSecret: 'oauth-client-secret',
          scope: ['.default']
        }
      }
    };
    const authorization = buildAuthorizationConfig({workflows: [noIssuer]});
    expect(authorization.length).to.be(1);
    expect(authorization[0].issuer).to.be(undefined);
  });

  it('should pass through partial oauth blocks without validation', () => {
    const partial = {
      clientId: 'rp-partial',
      callback: {
        url: 'https://gateway.example.com/result',
        oauth: {
          issuer: 'https://login.example.com/tenant-id/v2.0'
        }
      }
    };
    const authorization = buildAuthorizationConfig({workflows: [partial]});
    expect(authorization.length).to.be(1);
    expect(authorization[0].issuer).to.be(
      'https://login.example.com/tenant-id/v2.0');
    expect(authorization[0].client_id).to.be(undefined);
    expect(authorization[0].client_secret).to.be(undefined);
    expect(authorization[0].token_endpoint).to.be(undefined);
    expect(authorization[0].scope).to.be(undefined);
  });
});
