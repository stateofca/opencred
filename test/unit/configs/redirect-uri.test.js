/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  getRegisteredRedirectUris,
  isAllowedRedirectUri,
  resolveContextRedirectUri
} from '../../../lib/redirect-uri.js';

import expect from 'expect.js';
import {OpenCredConfigSchema} from '../../../configs/config-utils.js';
import {z} from 'zod';

const redirectUriField = z.union([
  z.url(),
  z.array(z.url()).min(1)
]).transform(uri => {
  const list = Array.isArray(uri) ? uri : [uri];
  return [...new Set(list)];
});

const workflowWithOidc = redirectUris => ({
  oidc: {redirectUri: redirectUris}
});

const minimalWorkflowConfig = redirectUris => ({
  workflows: [{
    clientId: 'test',
    clientSecret: 'secret',
    type: 'native',
    query: [{
      type: ['VerifiableCredential'],
      context: ['https://www.w3.org/ns/credentials/v2']
    }],
    oidc: {redirectUri: redirectUris, claims: []}
  }],
  defaultBrand: {cta: '#006847', primary: '#008f5a', header: '#004225'}
});

describe('redirectUri config field', () => {
  it('should normalize via OpenCredConfigSchema', () => {
    const parsed = OpenCredConfigSchema.parse(
      minimalWorkflowConfig('https://example.com/cb'));
    expect(parsed.workflows[0].oidc.redirectUri).to.eql(
      ['https://example.com/cb']);
  });

  it('should parse redirectUri arrays via OpenCredConfigSchema', () => {
    const parsed = OpenCredConfigSchema.parse(minimalWorkflowConfig([
      'https://example.com/a',
      'https://example.com/b'
    ]));
    expect(parsed.workflows[0].oidc.redirectUri).to.eql([
      'https://example.com/a',
      'https://example.com/b'
    ]);
  });
  it('should normalize a string to a one-element array', () => {
    const result = redirectUriField.parse('https://example.com/cb');
    expect(result).to.eql(['https://example.com/cb']);
  });

  it('should parse an array and dedupe entries', () => {
    const result = redirectUriField.parse([
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/a'
    ]);
    expect(result).to.eql([
      'https://example.com/a',
      'https://example.com/b'
    ]);
  });

  it('should reject an empty array', () => {
    const result = redirectUriField.safeParse([]);
    expect(result.success).to.be(false);
  });
});

describe('redirect-uri helpers', () => {
  const workflow = workflowWithOidc([
    'https://example.com',
    'https://example.org'
  ]);

  it('should list registered redirect URIs', () => {
    expect(getRegisteredRedirectUris({workflow})).to.eql([
      'https://example.com',
      'https://example.org'
    ]);
  });

  it('should allow whitelisted redirect URIs', () => {
    expect(isAllowedRedirectUri({
      workflow,
      redirectUri: 'https://example.org'
    })).to.be(true);
    expect(isAllowedRedirectUri({
      workflow,
      redirectUri: 'https://other.example'
    })).to.be(false);
  });

  it('should prefer exchange-bound redirect URI in context', () => {
    const uri = resolveContextRedirectUri({
      workflow,
      exchange: {oidc: {redirectUri: 'https://example.org'}}
    });
    expect(uri).to.equal('https://example.org');
  });

  it('should fall back to sole whitelist entry without exchange URI', () => {
    const single = workflowWithOidc(['https://only.example']);
    expect(resolveContextRedirectUri({workflow: single, exchange: {}}))
      .to.equal('https://only.example');
  });

  it('should not resolve context URI when multiple registered and unbound',
    () => {
      expect(resolveContextRedirectUri({workflow, exchange: {}}))
        .to.be(undefined);
    });
});
