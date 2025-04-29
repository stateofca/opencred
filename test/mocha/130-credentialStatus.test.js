/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {
  createList as createBitstringStatusList,
  createCredential as createStatusCredential,
} from '@digitalbazaar/vc-bitstring-status-list';
import {createPresentation, signPresentation} from '@digitalbazaar/vc';
import expect from 'expect.js';
import fs from 'node:fs';

import {config} from '@bedrock/core';
import {documentLoader} from '../utils/testDocumentLoader.js';
import {generateValidDidKeyData} from '../utils/dids.js';
import {generateValidJwtVpToken} from '../utils/jwtVpTokens.js';
import {generateValidSignedCredential} from '../utils/credentials.js';
import {NativeWorkflowService} from '../../lib/workflows/native-workflow.js';
import {verifyUtils} from '../../common/utils.js';

const rp = {
  workflow: {
    id: 'testworkflow',
    type: 'native',
    untrustedVariableAllowList: ['redirectPath']
  },
  domain: 'http://example.test.com'
};

describe('Credential Status Verification', async () => {
  let service;
  let exchange;
  let rpStub;

  before(() => {
    // Initialize service and stubs
    service = new NativeWorkflowService({get: () => {}, post: () => {}});

    // Load exchange fixture
    exchange = JSON.parse(fs.readFileSync(
      './test/fixtures/exchange.json'));
    exchange.createdAt = new Date(exchange.createdAt);
    exchange.recordExpiresAt = new Date(exchange.recordExpiresAt);

    rpStub = sinon.stub(config.opencred, 'relyingParties').value(
      [{
        workflow: {
          id: 'testworkflow',
          type: 'native',
          untrustedVariableAllowList: ['redirectPath']
        },
        domain: 'http://example.test.com',
        trustedCredentialIssuers: []
      }]
    );
  });

  after(() => {
    sinon.restore();
  });

  it('should pass verification when credential has no status', async () => {
    // TODO: Implement test for credential with no status field
    // This test should verify that a credential without credentialStatus field
    // passes verification without errors
    const credential = {
      NOcredentialStatus: null
    };
    const statusResult = await verifyUtils.checkStatus({
      credential, documentLoader
    });
    expect(statusResult.verified).to.be(true);
  });

  it('JWT VC should fail verification with unknown status type', async () => {
    const {vcToken} = await generateValidJwtVpToken({
      template: {
        credentialStatus: {
          id: 'https://example.com/status/123',
          type: 'UnsupportedStatusType'
        }
      }
    });
    const verifyResult = await verifyUtils.verifyCredentialJWT(vcToken, {
      documentLoader,
      checkStatus: verifyUtils.checkStatus
    });
    expect(verifyResult.verified).to.be(false);
    expect(verifyResult.errors.length).to.be(1);
    expect(verifyResult.errors[0]).to.contain('UnsupportedStatusType');
  });

  it('DI credential should fail with unsupported status type', async () => {
    // TODO: Implement test for credential with unsupported status type
    // This test should verify that a credential with an unsupported
    // credentialStatus type fails verification with appropriate error
    const credential = {
      credentialStatus: {
        id: 'https://example.com/status/123',
        type: 'UnsupportedStatusType'
      }
    };
    const statusResult = await verifyUtils.checkStatus({
      credential, documentLoader
    });
    expect(statusResult.verified).to.be(false);
    expect(statusResult.errors.length).to.be(1);
    expect(statusResult.errors[0]).to.contain('UnsupportedStatusType');
  });

  it('should pass verification when credential has valid status', async () => {
    const rpStub = sinon.stub(config.opencred, 'relyingParties').value(
      [{...rp, trustedCredentialIssuers: []}]
    );

    // Consider refactoring into more utility functions
    const {
      did: holderDid, suite: holderSuite
    } = await generateValidDidKeyData();

    const statusCredentialTemplate = await createStatusCredential({
      id: `urn:uuid:${globalThis.crypto.randomUUID()}`,
      list: await createBitstringStatusList({length: 131072}),
      statusPurpose: 'revocation'
    });
    const {credential: statusCredential,
      issuerDid, issuerSuite} = await generateValidSignedCredential({
      holderDid,
      didMethod: 'key',
      credentialTemplate: statusCredentialTemplate
    });
    const {credential} = await generateValidSignedCredential({
      issuerDid,
      issuerSuite,
      holderDid,
      credentialTemplate: {
        credentialStatus: {
          id: `${statusCredential.id}#94567`,
          type: 'BitstringStatusListEntry',
          statusPurpose: 'revocation',
          statusListIndex: '94567',
          statusListCredential: statusCredential.id
        }
      }
    });

    const presentation = await signPresentation({
      presentation: createPresentation({
        verifiableCredential: [credential],
        holder: holderDid
      }),
      challenge: exchange.challenge,
      documentLoader,
      suite: holderSuite
    });

    const aR = exchange.variables.authorizationRequest;
    const presentation_submission = {
      id: `urn:uuid:${globalThis.crypto.randomUUID()}`,
      definition_id: aR.presentation_definition.id,
      descriptor_map: [
        {
          id: aR?.presentation_definition.input_descriptors?.[0].id,
          path: '$',
          format: 'ldp_vp',
          path_nested: {
            format: 'ldp_vc',
            path: '$.verifiableCredential[0]'
          }
        }
      ]
    };

    const docLoaderWithStatusCredential = url => {
      if(url === statusCredential.id) {
        return {
          documentUrl: statusCredential.id,
          document: statusCredential,
          contextUrl: null
        };
      }
      return documentLoader(url);
    };
    const result = await service.verifySubmission(
      presentation, presentation_submission, exchange,
      docLoaderWithStatusCredential,
    );

    // expect(verifyStub.called).to.be(true);
    expect(result.verified).to.be(true);
    expect(result.errors.length).to.be(0);

    rpStub.restore();
  });
});
