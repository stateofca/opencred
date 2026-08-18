/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {config} from '@bedrock/core';
import {database} from '../../lib/database.js';
import {exampleKey2} from '../fixtures/signingKeys.js';
import expect from 'expect.js';
import {NativeWorkflowService} from '../../lib/workflows/native-workflow.js';
import {withStubs} from '../utils/withStubs.js';

const workflow = {
  type: 'native',
  clientId: 'multi-profile-response-test',
  clientSecret: 'shhh',
  query: [{
    format: ['mso_mdoc'],
    fields: {'org.iso.18013.5.1': ['given_name']}
  }]
};

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(key, value) {
      this.headers[key] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

// A pending set as the authorization request endpoint writes it: one entry per
// profile, each holding only its own key material. The material is real enough
// in shape to get past each handler's validation, which is how these tests
// probe whether hydration delivered the right entry.
//
// These fixtures are hand-built and therefore assume each entry already carries
// its `authorizationRequest`. That assumption is exactly what let the dropped
// Annex C request bug through here; the request-to-persistence seam that
// actually populates these entries is covered by
// `test/bedrock/320-multi-profile-dc-api-request.test.js`.
function pendingRequests() {
  return [
    {
      profile: 'apple-wallet',
      protocol: 'org-iso-mdoc',
      requestGroupId: 'group-1',
      authorizationRequest: {
        nonce: 'apple-nonce',
        expected_origins: ['https://example.com']
      },
      material: {
        hpkeRecipientPrivateKey: {
          kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd'
        },
        base64EncryptionInfo: 'apple-encryption-info',
        base64DeviceRequest: 'apple-device-request'
      }
    },
    {
      profile: 'google-wallet',
      protocol: 'openid4vp-v1-signed',
      requestGroupId: 'group-1',
      kid: 'urn:uuid:google-key',
      authorizationRequest: {nonce: 'google-nonce'},
      material: {
        ephemeralKeyAgreementPrivateKey: {
          kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd',
          kid: 'urn:uuid:google-key'
        },
        encodedSessionTranscript: new Uint8Array([1, 2, 3])
      }
    }
  ];
}

function makeExchange() {
  return {
    id: 'multi-profile-response-exchange',
    workflowId: workflow.clientId,
    state: 'active',
    step: 'default',
    variables: {
      procedurePath: 'verification',
      dcApiRequests: pendingRequests()
    }
  };
}

describe('multi-profile DC API response routing', function() {
  let service;
  let rpStub;
  let baseUriStub;
  let signingKeysStub;

  beforeEach(function() {
    service = new NativeWorkflowService();
    rpStub = sinon.stub(config.opencred, 'workflows').value([workflow]);
    baseUriStub = sinon.stub(config.server, 'baseUri')
      .value('https://example.com');
    signingKeysStub = sinon.stub(config.opencred, 'signingKeys')
      .value([{...exampleKey2, purpose: ['authorization_request']}]);
  });

  afterEach(function() {
    rpStub.restore();
    baseUriStub.restore();
    signingKeysStub.restore();
  });

  async function respond(responseBody) {
    let replaceStub;
    let updateStub;
    let res;
    const exchange = makeExchange();
    await withStubs(
      () => {
        replaceStub = sinon.stub(
          database.collections.Exchanges, 'replaceOne').resolves();
        updateStub = sinon.stub(
          database.collections.Exchanges, 'updateOne').resolves();
        return [replaceStub, updateStub];
      },
      async () => {
        const req = {
          workflow,
          exchange,
          body: responseBody,
          query: {},
          headers: {'user-agent': 'test-agent'},
          originalUrl: `/workflows/${workflow.clientId}/exchanges/` +
            `${exchange.id}/openid/client/authorization/response`
        };
        res = mockRes();
        await service.authorizationResponseMiddleware(req, res, () => {});
      }
    );
    return {res, replaceStub};
  }

  // With both requests pending, the only thing distinguishing them is the DC
  // API protocol the wallet answered with. These two tests prove the response
  // reached the right profile's handler carrying the right material: each
  // handler's own validation would say "not found in exchange variables" if
  // hydration had delivered the wrong entry or none.
  describe('routing by protocol', function() {
    it('routes an org-iso-mdoc response to apple-wallet, with its own ' +
      'HPKE material hydrated', async function() {
      const {res} = await respond({
        protocol: 'org-iso-mdoc',
        data: {response: 'not-really-encrypted'}
      });

      expect(res.statusCode).to.not.equal(200);
      const message = res.body?.message ?? '';
      // Reached the Annex C HPKE decryption stage, which is only possible once
      // that handler found `hpkeRecipientPrivateKey` and `base64EncryptionInfo`
      // under the flat names it reads — i.e. the apple-wallet entry's material
      // was hydrated. It then fails on the deliberately bogus ciphertext.
      expect(message).to.contain('EncryptedResponse');
      expect(message).to.not.contain(
        'HPKE recipient private key not found');
      expect(message).to.not.contain('EncryptionInfo not found');
      expect(message).to.not.contain('Authorization request not found');
      expect(message).to.not.contain('Profile not found');
    });

    it('routes an openid4vp-v1-signed response to google-wallet, not to ' +
      'the Annex C handler', async function() {
      const {res} = await respond({
        protocol: 'openid4vp-v1-signed',
        data: {response: 'not-really-a-jwe'}
      });

      expect(res.statusCode).to.not.equal(200);
      const message = res.body?.message ?? '';
      // Reached the google-wallet handler's own dcql_query validation, so the
      // google-wallet entry was hydrated. Annex C is the other pending entry;
      // any of its messages here would mean the response was misrouted.
      expect(message).to.contain('dcql_query');
      expect(message).to.not.contain('EncryptionInfo not found');
      expect(message).to.not.contain(
        'HPKE recipient private key not found');
      expect(message).to.not.contain('Authorization request not found');
      expect(message).to.not.contain('Profile not found');
    });
  });

  describe('unroutable responses', function() {
    it('rejects a protocol no pending request used', async function() {
      const {res} = await respond({
        protocol: 'openid4vp-v1-unsigned',
        data: {response: 'x'}
      });
      expect(res.statusCode).to.equal(400);
      expect(res.body.error).to.equal('DC_API_RESPONSE_UNMATCHED');
      // The diagnostic value is naming what arrived versus what was pending.
      expect(res.body.message).to.contain('openid4vp-v1-unsigned');
      expect(res.body.message).to.contain('org-iso-mdoc');
    });
  });

  // A failed response leaves the already-issued requests usable, so a user
  // whose Apple Wallet attempt failed can retry with Google without a fresh
  // authorization request call.
  describe('pending requests on failure', function() {
    it('retains dcApiRequests when the response fails', async function() {
      const {replaceStub} = await respond({
        protocol: 'org-iso-mdoc',
        data: {response: 'not-really-encrypted'}
      });

      // Whether or not the failure path persists anything, what must never
      // happen is persisting the exchange with its pending requests dropped —
      // that is what would force a fresh authorization request call to retry.
      const droppedPending = replaceStub.getCalls().some(call => {
        const variables = call.args[1]?.variables;
        return variables && !variables.dcApiRequests;
      });
      expect(droppedPending).to.be(false);
    });
  });

  describe('legacy exchanges', function() {
    // Exchanges created before multi-profile support are mid-flight when this
    // ships and must still complete.
    it('falls back to the flat slot when there are no pending requests',
      async function() {
        let res;
        await withStubs(
          () => [
            sinon.stub(database.collections.Exchanges, 'replaceOne').resolves(),
            sinon.stub(database.collections.Exchanges, 'updateOne').resolves()
          ],
          async () => {
            const exchange = {
              id: 'legacy-exchange',
              workflowId: workflow.clientId,
              state: 'active',
              step: 'default',
              variables: {
                profile: 'apple-wallet',
                authorizationRequest: {
                  nonce: 'n', expected_origins: ['https://example.com']
                },
                hpkeRecipientPrivateKey: {
                  kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd'
                },
                base64EncryptionInfo: 'legacy-encryption-info'
              }
            };
            const req = {
              workflow,
              exchange,
              body: {
                protocol: 'org-iso-mdoc',
                data: {response: 'not-really-encrypted'}
              },
              query: {},
              headers: {'user-agent': 'test-agent'},
              originalUrl: `/workflows/${workflow.clientId}/exchanges/` +
                `${exchange.id}/openid/client/authorization/response`
            };
            res = mockRes();
            await service.authorizationResponseMiddleware(req, res, () => {});
          }
        );

        const message = res.body?.message ?? '';
        // Reached the Annex C handler using the flat slot: no resolution error,
        // and its prerequisites were satisfied.
        expect(res.body?.error).to.not.equal('DC_API_RESPONSE_UNMATCHED');
        expect(message).to.not.contain('EncryptionInfo not found');
        expect(message).to.not.contain('Profile not found');
      });
  });

  // A DC API attempt failed, and the wallet fell back to the draft-18 flow on
  // the SAME exchange. The draft-18 request handler left its flat request state
  // beside the abandoned DC API pending array (the request-side clear that
  // removes it is exercised by 320; this proves the response side is robust
  // even when the array is still present). A `direct_post` response carries no
  // DC API protocol marker, so it must resolve against the flat state and reach
  // the standard handler — never the first entry of the stale DC API array.
  describe('non-DC-API fallback after a failed DC API attempt', function() {
    async function respondFallback(responseBody) {
      let res;
      await withStubs(
        () => [
          sinon.stub(database.collections.Exchanges, 'replaceOne').resolves(),
          sinon.stub(database.collections.Exchanges, 'updateOne').resolves()
        ],
        async () => {
          const exchange = {
            id: 'draft18-fallback-exchange',
            workflowId: workflow.clientId,
            state: 'active',
            step: 'default',
            variables: {
              procedurePath: 'verification',
              // Flat draft-18 request state, as the standard handler persists
              // it: OID4VP-draft18 is not a DC API profile, so it routes to
              // the standard response handler.
              profile: 'OID4VP-draft18',
              authorizationRequest: {
                response_mode: 'direct_post',
                nonce: 'draft18-nonce'
              },
              // The spent DC API offer, left behind by the failed attempt.
              dcApiRequests: pendingRequests()
            }
          };
          const req = {
            workflow,
            exchange,
            body: responseBody,
            query: {},
            headers: {'user-agent': 'test-agent'},
            originalUrl: `/workflows/${workflow.clientId}/exchanges/` +
              `${exchange.id}/openid/client/authorization/response`
          };
          res = mockRes();
          await service.authorizationResponseMiddleware(req, res, () => {});
        }
      );
      return res;
    }

    it('routes a direct_post response to the standard handler, not the ' +
      'stale DC API array', async function() {
      // A direct_post body: a bare presentation submission with no `protocol`
      // marker and (deliberately) no vp_token. The standard handler is the
      // only handler that reports a missing vp_token; every DC API handler
      // would first fail on its own missing key material, so those messages
      // appearing here would mean the response was misrouted to the stale
      // apple-wallet entry that sits first in the pending array.
      const res = await respondFallback({presentation_submission: '{}'});

      const message = res.body?.message ?? '';
      expect(message).to.contain('vp_token not found');
      expect(res.body?.error).to.not.equal('DC_API_RESPONSE_UNMATCHED');
      expect(res.body?.error).to.not.equal('DC_API_RESPONSE_AMBIGUOUS');
      expect(message).to.not.contain('EncryptionInfo not found');
      expect(message).to.not.contain('HPKE recipient private key not found');
      expect(message).to.not.contain('EncryptedResponse');
      expect(message).to.not.contain('Authorization request not found');
      expect(message).to.not.contain('Profile not found');
    });
  });
});
