/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as jose from 'jose';
import {extractClaimsForIdToken, jwtFromExchange} from '../../common/oidc.js';
import {config} from '@bedrock/core';
import crypto from 'node:crypto';
import expect from 'expect.js';

describe('extractClaimsForIdToken', () => {

  it('should return null when credentials is null', () => {
    expect(extractClaimsForIdToken(null, [])).to.equal(null);
  });

  it('should return null when credentials is empty array', () => {
    expect(extractClaimsForIdToken([], [])).to.equal(null);
  });

  it('should return null when credential has no sub ' +
    '(no credentialSubject.id or id)', () => {
    const credentials = [{
      credentialSubject: {},
      id: undefined
    }];
    expect(extractClaimsForIdToken(credentials, [])).to.equal(null);
  });

  it('should use credentialSubject.id for sub when present', () => {
    const credentials = [{
      id: 'cred-id',
      credentialSubject: {id: 'did:example:sub', userEmail: 'x@y.com'}
    }];
    const claimsConfig = [{name: 'email', path: 'userEmail'}];
    const result = extractClaimsForIdToken(credentials, claimsConfig);
    expect(result.sub).to.equal('did:example:sub');
    expect(result.email).to.equal('x@y.com');
  });

  it('should use credential.id for sub when credentialSubject.id ' +
    'is missing', () => {
    const credentials = [{
      id: 'cred-id',
      credentialSubject: {userEmail: 'x@y.com'}
    }];
    const claimsConfig = [{name: 'email', path: 'userEmail'}];
    const result = extractClaimsForIdToken(credentials, claimsConfig);
    expect(result.sub).to.equal('cred-id');
    expect(result.email).to.equal('x@y.com');
  });

  it('should extract ldp_vc claims with dot path (default format)', () => {
    const credentials = [{
      id: 'did:example:123',
      credentialSubject: {
        id: 'did:example:123',
        userEmail: 'alice@example.com',
        givenName: 'Alice'
      }
    }];
    const claimsConfig = [
      {name: 'email', path: 'userEmail'},
      {name: 'given_name', path: 'givenName'}
    ];
    const result = extractClaimsForIdToken(credentials, claimsConfig);
    expect(result).to.eql({
      sub: 'did:example:123',
      email: 'alice@example.com',
      given_name: 'Alice'
    });
  });

  it('should extract mso_mdoc claims with full namespace path', () => {
    const credentials = [{
      id: 'data:application/mdl;base64,abc',
      type: 'EnvelopedVerifiableCredential',
      credentialSubject: {
        id: 'data:application/mdl;base64,abc',
        'org.iso.18013.5.1.given_name': 'John',
        'org.iso.18013.5.1.family_name': 'Doe'
      }
    }];
    const claimsConfig = [
      {
        name: 'given_name',
        path: 'org.iso.18013.5.1.given_name',
        format: 'mso_mdoc'},
      {
        name: 'family_name',
        path: 'org.iso.18013.5.1.family_name',
        format: 'mso_mdoc'
      }
    ];
    const result = extractClaimsForIdToken(credentials, claimsConfig);
    expect(result).to.eql({
      sub: 'data:application/mdl;base64,abc',
      given_name: 'John',
      family_name: 'Doe'
    });
  });

  /**
   * ConfigUtils schemas will set a default format of 'ldp_vc', so
   * this condition should not occur.
   */
  it('should use first credential when no format specified', () => {
    const credentials = [{
      id: 'did:example:first',
      credentialSubject: {
        id: 'did:example:first',
        userEmail: 'first@example.com'
      }
    }, {
      id: 'data:application/mdl;base64,second',
      type: 'EnvelopedVerifiableCredential',
      credentialSubject: {
        id: 'data:application/mdl;base64,second',
        'org.iso.18013.5.1.given_name': 'Second'
      }
    }];
    const claimsConfig = [{name: 'email', path: 'userEmail'}];
    const result = extractClaimsForIdToken(credentials, claimsConfig);
    expect(result.sub).to.equal('did:example:first');
    expect(result.email).to.equal('first@example.com');
  });

  it('should extract format-specific claims in hybrid (VC + mdoc) flow', () => {
    const vcCred = {
      id: 'did:example:vc',
      credentialSubject: {
        id: 'did:example:vc',
        userEmail: 'vc@example.com'
      }
    };
    const mdocCred = {
      id: 'data:application/mdl;base64,mdoc',
      type: 'EnvelopedVerifiableCredential',
      credentialSubject: {
        id: 'data:application/mdl;base64,mdoc',
        'org.iso.18013.5.1.given_name': 'Jane',
        'org.iso.18013.5.1.family_name': 'Smith'
      }
    };
    const credentials = [vcCred, mdocCred];
    const claimsConfig = [
      {name: 'email', path: 'userEmail', format: 'ldp_vc'},
      {
        name: 'given_name',
        path: 'org.iso.18013.5.1.given_name',
        format: 'mso_mdoc'
      },
      {
        name: 'family_name',
        path: 'org.iso.18013.5.1.family_name',
        format: 'mso_mdoc'
      },
      { // non-existent claim
        name: 'middle_name',
        path: 'org.iso.18013.5.1.middle_name',
        format: 'mso_mdoc'
      }
    ];
    const result = extractClaimsForIdToken(credentials, claimsConfig);
    expect(result).to.eql({
      sub: 'did:example:vc',
      email: 'vc@example.com',
      given_name: 'Jane',
      family_name: 'Smith'
    });
  });

  it('should skip claim when no credential matches format', () => {
    const credentials = [{
      id: 'did:example:vc',
      credentialSubject: {
        id: 'did:example:vc',
        userEmail: 'vc@example.com'
      }
    }];
    const claimsConfig = [
      {name: 'email', path: 'userEmail', format: 'ldp_vc'},
      {
        name: 'given_name',
        path: 'org.iso.18013.5.1.given_name',
        format: 'mso_mdoc'
      }
    ];
    const result = extractClaimsForIdToken(credentials, claimsConfig);
    expect(result).to.eql({
      sub: 'did:example:vc',
      email: 'vc@example.com'
    });
  });

  it('should return only sub when claimsConfig is empty', () => {
    const credentials = [{
      id: 'did:example:sub',
      credentialSubject: {id: 'did:example:sub'}
    }];
    const result = extractClaimsForIdToken(credentials, []);
    expect(result).to.eql({sub: 'did:example:sub'});
  });

  it('should return only sub when claimsConfig is null/undefined', () => {
    const credentials = [{
      id: 'did:example:sub',
      credentialSubject: {id: 'did:example:sub'}
    }];
    expect(extractClaimsForIdToken(credentials, null)).to.eql(
      {sub: 'did:example:sub'});
    expect(extractClaimsForIdToken(credentials, undefined)).to.eql(
      {sub: 'did:example:sub'});
  });

  it('should support JSONPath with $ prefix for ldp_vc', () => {
    const credentials = [{
      id: 'did:example:1',
      credentialSubject: {
        id: 'did:example:1',
        nested: {field: 'value'}
      }
    }];
    const claimsConfig = [{name: 'nested_field', path: '$.nested.field'}];
    const result = extractClaimsForIdToken(credentials, claimsConfig);
    expect(result.nested_field).to.equal('value');
  });

  it('should support JSONPath with $ prefix for mso_mdoc', () => {
    const credentials = [{
      id: 'data:application/mdl;base64,x',
      type: 'EnvelopedVerifiableCredential',
      credentialSubject: {
        id: 'data:application/mdl;base64,x',
        'org.iso.18013.5.1.given_name': 'Test'
      }
    }];
    const claimsConfig = [{
      name: 'given_name',
      path: '$[\'org.iso.18013.5.1.given_name\']',
      format: 'mso_mdoc'
    }];
    const result = extractClaimsForIdToken(credentials, claimsConfig);
    expect(result.given_name).to.equal('Test');
  });
});

describe('jwtFromExchange ES256 signature encoding', () => {
  let publicKeyPem;
  let savedOpencred;
  let savedServer;

  before(() => {
    // Generate an ES256 (P-256) signing key for the test.
    const {privateKey, publicKey} = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256'
    });
    const privateKeyPem = privateKey.export({type: 'pkcs8', format: 'pem'});
    publicKeyPem = publicKey.export({type: 'spki', format: 'pem'});

    savedOpencred = config.opencred;
    savedServer = config.server;
    config.opencred = {
      ...config.opencred,
      signingKeys: [{
        id: 'test-es256-kid',
        type: 'ES256',
        purpose: ['id_token'],
        privateKeyPem,
        publicKeyPem
      }]
    };
    config.server = {...config.server, baseUri: 'https://verifier.example'};
  });

  after(() => {
    config.opencred = savedOpencred;
    config.server = savedServer;
  });

  function exchangeWithSubject(sub) {
    return {
      step: 'default',
      variables: {
        results: {
          default: {
            verifiablePresentation: {
              verifiableCredential: [{id: sub, credentialSubject: {id: sub}}]
            }
          }
        }
      }
    };
  }

  it('signs id_tokens with a JWS-compliant (IEEE P1363) ES256 signature',
    async () => {
      const workflow = {clientId: 'test-client', oidc: {claims: []}};
      const jwt = await jwtFromExchange(
        exchangeWithSubject('did:example:subject'), workflow);
      expect(jwt).to.be.a('string');

      // A standards-compliant verifier (jose) accepts the token only if the
      // ECDSA signature is raw r||s (IEEE P1363). A DER-encoded signature —
      // Node's default — is rejected, so this fails without the fix.
      const publicKey = await jose.importSPKI(publicKeyPem, 'ES256');
      const {payload, protectedHeader} = await jose.jwtVerify(jwt, publicKey, {
        algorithms: ['ES256']
      });
      expect(protectedHeader.alg).to.equal('ES256');
      expect(payload.sub).to.equal('did:example:subject');
      expect(payload.aud).to.equal('test-client');
      expect(payload.iss).to.equal('https://verifier.example');

      // A P-256 P1363 signature is exactly 64 bytes (two 32-byte integers);
      // DER encoding is variable-length (typically 70-72 bytes).
      const signatureBytes = Buffer.from(jwt.split('.')[2], 'base64url');
      expect(signatureBytes.length).to.equal(64);
    });
});
