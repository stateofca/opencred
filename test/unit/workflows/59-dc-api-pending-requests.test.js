/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  buildPendingRequest,
  extractRequestMaterial,
  hasResponseState,
  hydratePendingRequest,
  readPendingRequests
} from '../../../lib/workflows/common/dc-api-pending-requests.js';

import expect from 'expect.js';
import {klona} from 'klona';

describe('dc-api-pending-requests', () => {
  describe('extractRequestMaterial', () => {
    it('captures only what the handler added', () => {
      const material = extractRequestMaterial({
        variablesBefore: {procedurePath: 'verification'},
        variablesAfter: {
          procedurePath: 'verification',
          profile: 'apple-wallet',
          authorizationRequest: {nonce: 'n'},
          hpkeRecipientPrivateKey: {kty: 'EC'},
          base64EncryptionInfo: 'abc'
        }
      });
      expect(material).to.eql({
        hpkeRecipientPrivateKey: {kty: 'EC'},
        base64EncryptionInfo: 'abc'
      });
    });

    it('excludes profile and authorizationRequest, which are stored as ' +
      'named fields', () => {
      const material = extractRequestMaterial({
        variablesBefore: {},
        variablesAfter: {profile: 'x', authorizationRequest: {}}
      });
      expect(material).to.eql({});
    });

    // The spruceid handler derives its result with klona(exchange), so every
    // nested value is a fresh reference. A reference comparison would copy the
    // entire pre-existing variables object — including session secrets — into
    // every pending request.
    it('does not treat deep clones of unchanged values as new material', () => {
      const variablesBefore = {
        procedurePath: 'verification',
        oid4vpSession: {id: 'sess', clientSecret: 'shh'},
        results: {default: {errors: []}}
      };
      const variablesAfter = {
        ...klona(variablesBefore),
        deviceRequest: 'dr'
      };
      const material = extractRequestMaterial({
        variablesBefore, variablesAfter
      });
      expect(material).to.eql({deviceRequest: 'dr'});
      expect(material.oid4vpSession).to.be(undefined);
    });

    it('captures a value that genuinely changed', () => {
      const material = extractRequestMaterial({
        variablesBefore: {token: {a: 1}},
        variablesAfter: {token: {a: 2}}
      });
      expect(material).to.eql({token: {a: 2}});
    });

    it('tolerates absent inputs', () => {
      expect(extractRequestMaterial()).to.eql({});
      expect(extractRequestMaterial({})).to.eql({});
    });
  });

  describe('buildPendingRequest', () => {
    it('stamps the profile protocol', () => {
      const entry = buildPendingRequest({
        profile: 'apple-wallet', requestGroupId: 'g1'
      });
      expect(entry.protocol).to.be('org-iso-mdoc');
      expect(entry.requestGroupId).to.be('g1');
    });

    it('lifts the ephemeral encryption key kid onto the entry', () => {
      const entry = buildPendingRequest({
        profile: 'google-wallet',
        requestGroupId: 'g1',
        variablesAfter: {
          ephemeralKeyAgreementPrivateKey: {kty: 'EC', kid: 'urn:uuid:abc'}
        }
      });
      expect(entry.kid).to.be('urn:uuid:abc');
    });

    it('omits kid when the handler generated no ephemeral key', () => {
      const entry = buildPendingRequest({
        profile: 'apple-wallet',
        requestGroupId: 'g1',
        variablesAfter: {base64EncryptionInfo: 'abc'}
      });
      expect(entry).to.not.have.property('kid');
    });

    it('omits authorizationRequest when the handler produced none', () => {
      const entry = buildPendingRequest({
        profile: 'apple-wallet',
        requestGroupId: 'g1',
        variablesAfter: {base64EncryptionInfo: 'abc'}
      });
      expect(entry).to.not.have.property('authorizationRequest');
    });

    // Annex C writes `authorizationRequest` only into its exchange variables,
    // never at the top level of its result. The entry must still carry it,
    // sourced from `variablesAfter`, or its response fails "Authorization
    // request not found in exchange variables".
    it('takes authorizationRequest from variablesAfter', () => {
      const entry = buildPendingRequest({
        profile: 'apple-wallet',
        requestGroupId: 'g1',
        variablesBefore: {procedurePath: 'verification'},
        variablesAfter: {
          procedurePath: 'verification',
          profile: 'apple-wallet',
          authorizationRequest: {nonce: 'n', expected_origins: ['https://x']},
          hpkeRecipientPrivateKey: {kty: 'EC'},
          base64EncryptionInfo: 'enc'
        }
      });
      expect(entry.authorizationRequest).to.eql({
        nonce: 'n', expected_origins: ['https://x']
      });
      // material is derived from the same source and excludes the named fields.
      expect(entry.material).to.eql({
        hpkeRecipientPrivateKey: {kty: 'EC'},
        base64EncryptionInfo: 'enc'
      });
    });
  });

  describe('hasResponseState', () => {
    it('is true when an authorizationRequest is present', () => {
      expect(hasResponseState({
        variables: {authorizationRequest: {nonce: 'n'}}
      })).to.be(true);
    });

    it('is true when a dcApiSession is present', () => {
      expect(hasResponseState({
        variables: {dcApiSession: {id: 's'}}
      })).to.be(true);
    });

    it('is false when neither is present', () => {
      expect(hasResponseState({variables: {base64EncryptionInfo: 'x'}}))
        .to.be(false);
      expect(hasResponseState({variables: {}})).to.be(false);
      expect(hasResponseState()).to.be(false);
    });
  });

  // extract and hydrate must remain exact inverses: a profile response handler
  // reads the flat variables it was written against, so any field that stops
  // round-tripping silently breaks verification for that profile.
  describe('hydratePendingRequest round-trip', () => {
    it('restores the flat shape a handler wrote', () => {
      const variablesBefore = {procedurePath: 'verification'};
      const handlerVariables = {
        ...variablesBefore,
        profile: 'apple-wallet',
        authorizationRequest: {nonce: 'n', state: 's'},
        hpkeRecipientPrivateKey: {kty: 'EC', d: 'x'},
        base64EncryptionInfo: 'enc',
        base64DeviceRequest: 'dev'
      };

      const entry = buildPendingRequest({
        profile: 'apple-wallet',
        requestGroupId: 'g1',
        variablesBefore,
        variablesAfter: handlerVariables
      });

      const hydrated = hydratePendingRequest({
        exchange: {id: 'e1', variables: variablesBefore}, entry
      });

      expect(hydrated.variables).to.eql(handlerVariables);
    });

    it('round-trips the google-wallet material shape', () => {
      const variablesBefore = {procedurePath: 'verification'};
      const handlerVariables = {
        ...variablesBefore,
        profile: 'google-wallet',
        authorizationRequest: {nonce: 'n'},
        ephemeralKeyAgreementPrivateKey: {kty: 'EC', kid: 'urn:uuid:a'},
        ephemeralKeyAgreementPublicKey: {kty: 'EC', kid: 'urn:uuid:a'},
        encodedSessionTranscript: new Uint8Array([1, 2, 3])
      };
      const entry = buildPendingRequest({
        profile: 'google-wallet',
        requestGroupId: 'g1',
        variablesBefore,
        variablesAfter: handlerVariables
      });
      const hydrated = hydratePendingRequest({
        exchange: {id: 'e1', variables: variablesBefore}, entry
      });
      expect(hydrated.variables).to.eql(handlerVariables);
    });

    it('keeps unrelated exchange fields and variables intact', () => {
      const exchange = {
        id: 'e1', state: 'active', variables: {procedurePath: 'login'}
      };
      const hydrated = hydratePendingRequest({
        exchange,
        entry: buildPendingRequest({
          profile: 'apple-wallet', requestGroupId: 'g1',
          variablesAfter: {base64EncryptionInfo: 'enc'}
        })
      });
      expect(hydrated.id).to.be('e1');
      expect(hydrated.state).to.be('active');
      expect(hydrated.variables.procedurePath).to.be('login');
    });
  });

  describe('readPendingRequests', () => {
    it('returns stored entries', () => {
      const entries = [{profile: 'apple-wallet', protocol: 'org-iso-mdoc'}];
      expect(readPendingRequests({
        exchange: {variables: {dcApiRequests: entries}}
      })).to.be(entries);
    });

    it('returns an empty array when there is nothing pending', () => {
      expect(readPendingRequests({exchange: {variables: {}}})).to.eql([]);
      expect(readPendingRequests({exchange: {}})).to.eql([]);
      expect(readPendingRequests()).to.eql([]);
    });

    // Exchanges created before multi-profile support are mid-flight when this
    // ships and must still complete.
    it('synthesizes an entry from the legacy flat slot', () => {
      const entries = readPendingRequests({
        exchange: {
          variables: {
            profile: 'apple-wallet',
            authorizationRequest: {nonce: 'n'},
            hpkeRecipientPrivateKey: {kty: 'EC'}
          }
        }
      });
      expect(entries.length).to.be(1);
      expect(entries[0].profile).to.be('apple-wallet');
      expect(entries[0].protocol).to.be('org-iso-mdoc');
      expect(entries[0].legacy).to.be(true);
      // Material is empty because the handler already reads it from the flat
      // slot, so hydration must be a no-op for the legacy path.
      expect(entries[0].material).to.eql({});
    });

    it('hydrating a legacy entry leaves the flat variables untouched', () => {
      const variables = {
        profile: 'apple-wallet',
        authorizationRequest: {nonce: 'n'},
        hpkeRecipientPrivateKey: {kty: 'EC'}
      };
      const [entry] = readPendingRequests({exchange: {variables}});
      const hydrated = hydratePendingRequest({
        exchange: {variables}, entry
      });
      expect(hydrated.variables).to.eql(variables);
    });

    // A stale flat slot can coexist with real pending requests, because
    // pre-existing variables are preserved when the pending array is written.
    it('prefers stored entries over a stale flat slot', () => {
      const entries = [{profile: 'google-wallet', protocol: 'x'}];
      const result = readPendingRequests({
        exchange: {
          variables: {
            profile: 'apple-wallet',
            authorizationRequest: {nonce: 'stale'},
            dcApiRequests: entries
          }
        }
      });
      expect(result).to.be(entries);
    });
  });
});
