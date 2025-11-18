/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import expect from 'expect.js';
import fs from 'node:fs';
import {klona} from 'klona';

import {
  convertDerCertificateToPem,
  generateCertificateChain
} from '../utils/x509.js';
import {createId, verifyUtils} from '../../common/utils.js';
import {createPresentation, signPresentation} from '@digitalbazaar/vc';
import {
  generatePresentationSubmission,
  generateValidJwtVpToken
} from '../utils/jwtVpTokens.js';
import {config} from '@bedrock/core';
import {createExchangeWithAuthRequest} from '../utils/exchanges.js';
import {database} from '../../lib/database.js';
import {documentLoader} from '../utils/testDocumentLoader.js';
import {domainToDidWeb} from '../../lib/didWeb.js';
import {generateValidDidKeyData} from '../utils/dids.js';
import {generateValidSignedCredential} from '../utils/credentials.js';
import {getDocumentLoader} from '../../common/documentLoader.js';

import {withStubs} from '../utils/withStubs.js';

import {NativeWorkflowService} from '../../lib/workflows/native-workflow.js';

const rp = {
  type: 'native',
  clientId: 'testworkflow',
  untrustedVariableAllowList: ['redirectPath'],
  verifiablePresentationRequest: JSON.stringify({
    query: {
      type: 'QueryByExample',
      credentialQuery: {
        reason: 'Please present your Driver\'s License',
        example: {
          '@context': [
            'https://www.w3.org/ns/credentials/v2',
            'https://www.w3.org/ns/credentials/examples/v2'
          ],
          type: 'MyPrototypeCredential'
        }
      }
    }
  })
};

describe('Exchanges (Native)', async () => {
  let vp_token;
  let presentation_submission;
  let verifyStub;
  let dbStub;
  let service;

  before(() => {
    service = new NativeWorkflowService();
    const oid4vp = JSON.parse(fs.readFileSync(
      './test/fixtures/oid4vp_di.json'));
    vp_token = oid4vp.vp_token;
    presentation_submission = oid4vp.presentation_submission;
    dbStub = sinon.stub(database.collections.Exchanges, 'insertOne')
      .resolves({insertedId: 'test'});
    sinon.stub(getDocumentLoader(), 'build')
      .returns(() => {
        return Promise.resolve({/* mock resolved value */});
      });
    verifyStub = sinon.stub(verifyUtils, 'verifyPresentationDataIntegrity')
      .resolves({
        verified: true,
        presentationResult: {
          results: [{
            verified: true}
          ]
        },
        credentialResults: [{
          credentialId: 'did:example:testcredential',
          verified: true
        }]});
  });

  after(() => {
    sinon.restore();
  });

  it('should return exchange from createWorkflowSpecificExchange',
    async () => {
      const accessToken = await createId();
      const trustedVariables = {
        rp,
        accessToken,
        oidc: {
          code: null,
          state: 'test'
        }
      };
      const untrustedVariables = {};

      const exchange = await service.createWorkflowSpecificExchange(
        trustedVariables, untrustedVariables);
      expect(exchange).to.have.property('vcapi');
      expect(exchange).to.have.property('OID4VP');
      expect(exchange).to.have.property('id');
      expect(dbStub.called).to.be(true);
    });

  it('should return undefined for vc-api workflow',
    async () => {
      const accessToken = await createId();
      const vcApiRp = klona(rp);
      vcApiRp.type = 'vc-api';
      const trustedVariables = {
        rp: vcApiRp,
        accessToken,
        oidc: {
          code: null,
          state: 'test'
        }
      };
      const untrustedVariables = {};

      const exchange = await service.createWorkflowSpecificExchange(
        trustedVariables, untrustedVariables);
      expect(exchange).to.be(undefined);
    });

  it('should get the correct exchange data', async () => {
    const accessToken = await createId();
    const trustedVariables = {
      rp,
      accessToken,
      oidc: {
        code: null,
        state: 'test'
      }
    };
    const untrustedVariables = {};

    const exchange = await service.createWorkflowSpecificExchange(
      trustedVariables, untrustedVariables);

    expect(exchange).to.have.property('vcapi');
    expect(exchange).to.have.property('OID4VP');
    expect(exchange).to.have.property('id');
  });

  it('should set the right ttl and recordExpiresAt', async () => {
    await withStubs(
      () => {
        const optionsConfigStub = sinon.stub(config.opencred, 'options').value({
          ...config.opencred.options,
          recordExpiresDurationMs: 5000, // 5 seconds
          exchangeTtlSeconds: 16 // 16 seconds
        });
        return [optionsConfigStub];
      },
      async () => {
        const accessToken = await createId();
        const trustedVariables = {
          rp,
          accessToken,
          oidc: {
            code: null,
            state: 'test'
          }
        };
        const untrustedVariables = {};

        await service.createWorkflowSpecificExchange(
          trustedVariables, untrustedVariables);

        // TTL should be 16 seconds not 900 default or 5 (5).
        // because it will be the smaller of the default & db cache timeout
        expect(dbStub.lastCall?.args[0].ttl).to.be(16);

        // RecordexpiresAt should be at least ttl
        const recordExpiresAt = new Date(
          dbStub.lastCall?.args[0].recordExpiresAt);
        const createdAt = new Date(dbStub.lastCall?.args[0].createdAt);

        // Check that recordExpiresAt is as expected
        expect(recordExpiresAt.getTime()).to.equal(
          createdAt.getTime() + 60000 + 16000);
      }
    );
  });

  it('should verify a submission and return verified true', async () => {
    const rpStub = {...rp, trustedCredentialIssuers: []};
    const exchange = await createExchangeWithAuthRequest({rp: rpStub});

    // Consider refactoring into more utility functions
    const {
      did: holderDid, suite: holderSuite
    } = await generateValidDidKeyData();
    const {credential} = await generateValidSignedCredential({
      holderDid,
      didMethod: 'key',
      credentialTemplate: {
        id: 'did:example:testcredential'
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
    const submission = {
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

    const result = await service.verifySubmission({
      rp: rpStub, vp_token: presentation, submission, exchange});

    expect(verifyStub.called).to.be(true);
    expect(result.verified).to.be(true);
    expect(result.errors.length).to.be(0);
  });

  it('should require x5c in submission if CA Store in config', async () => {
    await withStubs(
      () => {
        const verifyUtilsStub = sinon.stub(verifyUtils, 'verifyPresentationJWT')
          .resolves({
            verified: true,
            verifiablePresentation: {vc: {proof: {jwt: '...'}}}}
          );
        const verifyUtilsStub2 = sinon.stub(verifyUtils, 'verifyCredentialJWT')
          .resolves({verified: true, signer: {}});
        const updateStub = sinon.stub(
          database.collections.Exchanges, 'updateOne')
          .resolves();
        return [verifyUtilsStub, verifyUtilsStub2, updateStub];
      },
      async () => {
        const rpStub = {...rp, trustedCredentialIssuers: [
          'did:web:not-a-valid-issuer.org'
        ]};
        const exchange = await createExchangeWithAuthRequest({rp: rpStub});

        const {vpToken: vp_token_jwt} = await generateValidJwtVpToken({
          aud: domainToDidWeb(config.server.baseUri),
          challenge: exchange.challenge
        });
        const submission = generatePresentationSubmission({
          authorizationRequest: exchange.variables.authorizationRequest,
          vpToken: vp_token_jwt
        });

        const result = await service.verifySubmission({
          rp: rpStub, vp_token: vp_token_jwt, submission, exchange});

        const expectedError = 'Unaccepted credential issuer';

        expect(verifyStub.called).to.be(true);
        expect(result.verified).to.be(false);
        expect(result.errors.includes(expectedError)).to.be(true);
      }
    );
  });

  it('should return an error if definition_id does not match', async () => {
    await withStubs(
      () => {
        const rpStub = sinon.stub(config.opencred, 'workflows').value(
          [rp]
        );
        return [rpStub];
      },
      async () => {
        const exchange = await createExchangeWithAuthRequest({rp});
        presentation_submission.definition_id = 'invalid';
        const result = await service.verifySubmission({
          rp, vp_token, submission: presentation_submission, exchange
        });

        expect(verifyStub.called).to.be.false;
        expect(result.verified).to.be(false);
        expect(result.errors.length).to.be.greaterThan(0);
      }
    );
  });

  it('should return an error if vp invalid', async () => {
    await withStubs(
      () => {
        const rpStub = sinon.stub(config.opencred, 'workflows').value(
          [rp]
        );
        verifyStub.restore();
        const newVerifyStub = sinon.stub(
          verifyUtils, 'verifyPresentationDataIntegrity')
          .resolves({verified: false, error: 'invalid vp'});
        return [rpStub, newVerifyStub];
      },
      async () => {
        const exchange = await createExchangeWithAuthRequest({rp});
        const result = await service.verifySubmission({
          rp, vp_token, submission: presentation_submission, exchange});

        expect(verifyStub.called).to.be.true;
        expect(result.verified).to.be(false);
        expect(result.errors.length).to.be.greaterThan(0);
      }
    );
  });

  it('should return an error if vc fails challenge', async () => {
    await withStubs(
      () => {
        const rpStub = sinon.stub(config.opencred, 'workflows').value(
          [rp]
        );
        return [rpStub];
      },
      async () => {
        const exchange = await createExchangeWithAuthRequest({rp});
        const result = await service.verifySubmission({
          rp, vp_token, submission: presentation_submission,
          exchange: {
            ...exchange,
            challenge: `incorrect`
          }
        });

        expect(result.verified).to.be(false);
        expect(result.errors.length).to.be.greaterThan(0);
      }
    );
  });

  it('should fail X.509 validation with invalid x5c chain', async () => {
    await withStubs(
      async () => {
        const {chain} = await generateCertificateChain({
          length: 3
        });
        const root = chain.pop();
        const verifyUtilsStub = sinon.stub(verifyUtils, 'verifyPresentationJWT')
          .resolves({
            verified: true,
            verifiablePresentation: {vc: {proof: {jwt: '...'}}}}
          );
        const verifyUtilsStub2 = sinon.stub(verifyUtils, 'verifyCredentialJWT')
          .resolves({verified: true, signer: {}});
        const updateStub = sinon.stub(
          database.collections.Exchanges, 'updateOne')
          .resolves();
        const caStoreStub = sinon.stub(config.opencred, 'caStore').value([
          convertDerCertificateToPem(root.raw, false)
        ]);
        return [verifyUtilsStub, verifyUtilsStub2, updateStub, caStoreStub];
      },
      async () => {
        const rpStub = {...rp, trustedCredentialIssuers: []};
        const exchange = await createExchangeWithAuthRequest({rp: rpStub});
        const {vpToken: vp_token_jwt} = await generateValidJwtVpToken({
          aud: domainToDidWeb(config.server.baseUri),
          challenge: exchange.challenge,
          x5c: (await generateCertificateChain({length: 3})).chain.map(
            c => convertDerCertificateToPem(c.raw, true))
        });
        const presentation_submission_jwt = generatePresentationSubmission({
          authorizationRequest: exchange.variables.authorizationRequest,
          vpToken: vp_token_jwt
        });

        const result = await service.verifySubmission({
          rp: rpStub, vp_token: vp_token_jwt,
          submission: presentation_submission_jwt, exchange});

        expect(result.verified).to.be(false);
        expect(result.errors.length).to.be(2);
        expect(result.errors[0]).to.be('Invalid certificate in x5c claim');
      }
    );
  });

  it('should fail X.509 validation with valid x5c chain ' +
    'and invalid did:jwk issuer', async () => {
    await withStubs(
      async () => {
        const verifyUtilsStub = sinon.stub(verifyUtils, 'verifyPresentationJWT')
          .resolves({
            verified: true,
            verifiablePresentation: {vc: {proof: {jwt: '...'}}}}
          );
        const verifyUtilsStub2 = sinon.stub(verifyUtils, 'verifyCredentialJWT')
          .resolves({verified: true, signer: {}});
        const updateStub = sinon.stub(
          database.collections.Exchanges, 'updateOne').resolves();

        const {chain} = await generateCertificateChain({length: 3});
        const root = chain.pop();
        const caStoreStub = sinon.stub(config.opencred, 'caStore').value([
          convertDerCertificateToPem(root.raw, false)
        ]);

        return [verifyUtilsStub, verifyUtilsStub2, updateStub, caStoreStub];
      },
      async () => {
        const rpStub = {...rp, trustedCredentialIssuers: []};
        const exchange = await createExchangeWithAuthRequest({rp: rpStub});
        const {vpToken: vp_token_jwt} = await generateValidJwtVpToken({
          aud: domainToDidWeb(config.server.baseUri),
          challenge: exchange.challenge,
          x5c: [
            'MIICaDCCAg6gAwIBAgIUHOO2dIyATRbAfyt3AcBO6DHawhEwCgYIKoZIzj0E' +
            'AwIwUDELMAkGA1UEBhMCVVMxDjAMBgNVBAgMBVVTLUNBMQwwCgYDVQQKDANE' +
            'TVYxIzAhBgNVBAMMGkNhbGlmb3JuaWEgRE1WIFJvb3QgQ0EgVUFUMB4XDTI0' +
            'MDEyMzE3NDc1MFoXDTI1MDEyMjE3NDc1MFowVjELMAkGA1UEBhMCVVMxDjAM' +
            'BgNVBAgMBVVTLUNBMQwwCgYDVQQKDANETVYxKTAnBgNVBAMMIHZjIG1kbCBT' +
            'aWduZXIgQ2FsaWZvcm5pYSBETVYgVUFUMFkwEwYHKoZIzj0CAQYIKoZIzj0D' +
            'AQcDQgAEfvsjCYeH1nRBf0N4vmw4IvVAnv+j82gJmwgvI0gXdyo4DjCg5Ks1' +
            'onZ1ClIwQpubx7Mvgy6ssCQUVwWbk6fJBaOBvzCBvDAdBgNVHQ4EFgQUprYJ' +
            'EADWkvGMda2GQgbKYfTXLWYwHwYDVR0jBBgwFoAUSWhCfS8C3wEPseC28Scm' +
            'Fn0j25UwHQYJYIZIAYb4QgENBBAWDkNhbGlmb3JuaWEgRE1WMA4GA1UdDwEB' +
            '/wQEAwIHgDAdBgNVHRIEFjAUgRJleGFtcGxlQGRtdi5jYS5nb3YwLAYDVR0f' +
            'BCUwIzAhoB+gHYYbaHR0cHM6Ly9tZGxzLmRtdi5jYS5nb3YvY3JsMAoGCCqG' +
            'SM49BAMCA0gAMEUCIQCGn0U8a0sdEUY7mjB0HYOnenqBNxC2sbX0tdm/lfpX' +
            'pwIgdFTNrjOJJEYDCbzvsjh832SZlK7nk2Hcl+EncyfraYY='
          ]
        });
        const presentation_submission_jwt = generatePresentationSubmission({
          authorizationRequest: exchange.variables.authorizationRequest,
          vpToken: vp_token_jwt
        });

        const result = await service.verifySubmission({
          rp: rpStub, vp_token: vp_token_jwt,
          submission: presentation_submission_jwt, exchange});

        expect(result.verified).to.be(false);
        expect(result.errors.length).to.be(2);
        expect(result.errors[0]).to.be('Invalid certificate in x5c claim');
      }
    );
  });

  it('should pass X.509 validation with valid x5c chain', async () => {
    await withStubs(
      async () => {
        const verifyUtilsStub = sinon.stub(verifyUtils, 'verifyPresentationJWT')
          .resolves({
            verified: true,
            verifiablePresentation: {vc: {proof: {jwt: '...'}}}}
          );
        const verifyUtilsStub2 = sinon.stub(verifyUtils, 'verifyCredentialJWT')
          .resolves({verified: true, signer: {}});
        const updateStub = sinon.stub(
          database.collections.Exchanges, 'updateOne').resolves();

        const {chain} = await generateCertificateChain({
          length: 3
        });
        const root = chain.pop();
        const caStoreStub = sinon.stub(config.opencred, 'caStore').value([
          convertDerCertificateToPem(root.raw, false)
        ]);
        return [verifyUtilsStub, verifyUtilsStub2, updateStub, caStoreStub];
      },
      async () => {
        const rpStub = {...rp, trustedCredentialIssuers: []};
        const exchange = await createExchangeWithAuthRequest({rp: rpStub});
        const {chain, leafKeyPair} = await generateCertificateChain({
          length: 3
        });
        const {vpToken: vp_token_jwt} = await generateValidJwtVpToken({
          aud: domainToDidWeb(config.server.baseUri),
          challenge: exchange.challenge,
          x5c: chain.map(c => convertDerCertificateToPem(c.raw, true)),
          leafKeyPair
        });
        const presentation_submission_jwt = generatePresentationSubmission({
          authorizationRequest: exchange.variables.authorizationRequest,
          vpToken: vp_token_jwt
        });

        const result = await service.verifySubmission({
          rp: rpStub, vp_token: vp_token_jwt,
          submission: presentation_submission_jwt, exchange});

        expect(result.verified).to.be(false);
        expect(result.errors.length).to.be(2);
        expect(result.errors[0]).to.be('Invalid certificate in x5c claim');
      }
    );
  });

  it('should pass X.509 validation with invalid x5c chain if' +
    ' caStore is false in rp', async () => {
    await withStubs(
      async () => {
        const {chain} = await generateCertificateChain({
          length: 3
        });
        const root = chain.pop();
        const rpStub = sinon.stub(config.opencred, 'workflows').value(
          [{...rp, trustedCredentialIssuers: [],
            // Bypass CA checks
            caStore: false
          }]
        );
        const vprCheckStub = sinon.stub(
          verifyUtils, 'checkVcForVpr').resolves(true);
        const verifyUtilsStub = sinon.stub(verifyUtils, 'verifyPresentationJWT')
          .resolves({
            verified: true,
            verifiablePresentation: {vc: {proof: {jwt: '...'}}}}
          );
        const verifyUtilsStub2 = sinon.stub(verifyUtils, 'verifyCredentialJWT')
          .resolves({verified: true, signer: {}});
        const updateStub = sinon.stub(
          database.collections.Exchanges, 'updateOne')
          .resolves();
        const caStoreStub = sinon.stub(config.opencred, 'caStore').value([
          convertDerCertificateToPem(root.raw, false)
        ]);
        return [rpStub, vprCheckStub, verifyUtilsStub,
          verifyUtilsStub2, updateStub, caStoreStub];
      },
      async () => {
        const rpStub = {...rp, trustedCredentialIssuers: [], caStore: false};
        const exchange = await createExchangeWithAuthRequest({rp: rpStub});
        const {chain} = await generateCertificateChain({
          length: 3
        });
        const {vpToken: vp_token_jwt} = await generateValidJwtVpToken({
          aud: domainToDidWeb(config.server.baseUri),
          challenge: exchange.challenge,
          x5c: chain.map(c => convertDerCertificateToPem(c.raw, true)),
          template: {
            '@context': [
              'https://www.w3.org/ns/credentials/v2',
              'https://www.w3.org/ns/credentials/examples/v2'
            ],
            type: ['VerifiableCredential', 'MyPrototypeCredential']
          }
        });
        const presentation_submission_jwt = generatePresentationSubmission({
          authorizationRequest: exchange.variables.authorizationRequest,
          vpToken: vp_token_jwt
        });

        const result = await service.verifySubmission({
          rp: rpStub, vp_token: vp_token_jwt,
          submission: presentation_submission_jwt, exchange});

        expect(result.verified).to.be(true);
        expect(result.errors.length).to.be(0);
      }
    );
  });

  it('should not fail trusted issuer check if issuer allowlist is empty',
    async () => {
      await withStubs(
        () => {
          const caStoreStub = sinon.stub(config.opencred, 'caStore').value([]);
          const rpStub = sinon.stub(config.opencred, 'workflows').value(
            [{...rp, trustedCredentialIssuers: []}]
          );
          const vprCheckStub = sinon.stub(
            verifyUtils, 'checkVcForVpr').resolves(true);
          const verifyUtilsStub = sinon.stub(
            verifyUtils, 'verifyPresentationJWT')
            .resolves({
              verified: true,
              verifiablePresentation: {vc: {proof: {jwt: '...'}}}}
            );
          const verifyUtilsStub2 = sinon.stub(
            verifyUtils, 'verifyCredentialJWT')
            .resolves({verified: true, signer: {}});
          const updateStub = sinon.stub(
            database.collections.Exchanges, 'updateOne')
            .resolves();
          return [caStoreStub, rpStub, vprCheckStub,
            verifyUtilsStub, verifyUtilsStub2, updateStub];
        },
        async () => {
          const rpStub = {...rp, trustedCredentialIssuers: []};
          const exchange = await createExchangeWithAuthRequest({rp: rpStub});
          const {vpToken: vp_token_jwt} = await generateValidJwtVpToken({
            aud: domainToDidWeb(config.server.baseUri),
            challenge: exchange.challenge,
            template: {
              '@context': [
                'https://www.w3.org/ns/credentials/v2',
                'https://www.w3.org/ns/credentials/examples/v2'
              ],
              type: ['VerifiableCredential', 'MyPrototypeCredential']
            }
          });
          const presentation_submission_jwt = generatePresentationSubmission({
            authorizationRequest: exchange.variables.authorizationRequest,
            vpToken: vp_token_jwt
          });

          const result = await service.verifySubmission({
            rp: rpStub, vp_token: vp_token_jwt,
            submission: presentation_submission_jwt, exchange});

          expect(result.verified).to.be(true);
          expect(result.errors.length).to.be(0);
        }
      );
    });

  it('should return an error if issuer allowlist is not empty and ' +
    'vc issuer is not in allowlist', async () => {
    await withStubs(
      () => {
        const caStoreStub = sinon.stub(config.opencred, 'caStore').value([]);
        const rpStub = sinon.stub(config.opencred, 'workflows').value(
          [{...rp, trustedCredentialIssuers: ['did:jwk:123']}]
        );
        const vprCheckStub = sinon.stub(
          verifyUtils, 'checkVcForVpr').resolves(true);
        const verifyUtilsStub = sinon.stub(verifyUtils, 'verifyPresentationJWT')
          .resolves({
            verified: true,
            verifiablePresentation: {vc: {proof: {jwt: '...'}}}}
          );
        const verifyUtilsStub2 = sinon.stub(verifyUtils, 'verifyCredentialJWT')
          .resolves({verified: true, signer: {}});
        const updateStub = sinon.stub(
          database.collections.Exchanges, 'updateOne')
          .resolves();
        return [caStoreStub, rpStub, vprCheckStub,
          verifyUtilsStub, verifyUtilsStub2, updateStub];
      },
      async () => {
        const rpStub = {...rp, trustedCredentialIssuers: []};
        const exchange = await createExchangeWithAuthRequest({rp: rpStub});
        const {vpToken: vp_token_jwt} = await generateValidJwtVpToken({
          aud: domainToDidWeb(config.server.baseUri),
          challenge: exchange.challenge
        });
        const presentation_submission_jwt = generatePresentationSubmission({
          authorizationRequest: exchange.variables.authorizationRequest,
          vpToken: vp_token_jwt
        });

        const result = await service.verifySubmission({
          rp: rpStub, vp_token: vp_token_jwt,
          submission: presentation_submission_jwt, exchange});

        expect(result.verified).to.be(false);
        expect(result.errors.length).to.be(1);
      }
    );
  });

  it('should return an error if issuer of inner credential ' +
    'is in allowlist, but VC-JWT issuer is not', async () => {
    await withStubs(
      () => {
        const caStoreStub = sinon.stub(config.opencred, 'caStore').value([]);
        const rpStub = sinon.stub(config.opencred, 'workflows').value(
          [{...rp, trustedCredentialIssuers: ['did:jwk:123']}]
        );
        const vprCheckStub = sinon.stub(
          verifyUtils, 'checkVcForVpr').resolves(true);

        const verifyUtilsStub = sinon.stub(verifyUtils, 'verifyPresentationJWT')
          .resolves({
            verified: true,
            verifiablePresentation: {vc: {proof: {jwt: '...'}}}}
          );
        const verifyUtilsStub2 = sinon.stub(verifyUtils, 'verifyCredentialJWT')
          .resolves({verified: true, signer: {}});
        const updateStub = sinon.stub(
          database.collections.Exchanges, 'updateOne')
          .resolves();
        return [caStoreStub, rpStub, vprCheckStub,
          verifyUtilsStub, verifyUtilsStub2, updateStub];
      },
      async () => {
        const rpStub = {...rp, trustedCredentialIssuers: []};
        const exchange = await createExchangeWithAuthRequest({rp: rpStub});
        const {vpToken: vp_token_jwt} = await generateValidJwtVpToken({
          aud: domainToDidWeb(config.server.baseUri),
          challenge: exchange.challenge,
          innerIssuerDid: 'did:jwk:123'
        });
        const presentation_submission_jwt = generatePresentationSubmission({
          authorizationRequest: exchange.variables.authorizationRequest,
          vpToken: vp_token_jwt
        });

        const result = await service.verifySubmission({
          rp: rpStub, vp_token: vp_token_jwt,
          submission: presentation_submission_jwt, exchange});

        expect(result.verified).to.be(false);
        expect(result.errors.length).to.be(1);
      }
    );
  });

  it('createWorkflowSpecificExchange should set oidc.state from query param',
    async () => {
      const accessToken = await createId();
      const trustedVariables = {
        rp,
        accessToken,
        oidc: {
          code: null,
          state: 'test'
        }
      };
      const untrustedVariables = {};

      const exchange = await service.createWorkflowSpecificExchange(
        trustedVariables, untrustedVariables);
      expect(exchange.oidc.state).to.be('test');
      expect(dbStub.called).to.be(true);
    });

  it('createWorkflowSpecificExchange should set oidc.state from body param',
    async () => {
      const accessToken = await createId();
      const trustedVariables = {
        rp,
        accessToken,
        oidc: {
          code: null,
          state: 'test'
        }
      };
      const untrustedVariables = {};

      const exchange = await service.createWorkflowSpecificExchange(
        trustedVariables, untrustedVariables);
      expect(exchange.oidc.state).to.be('test');
      expect(dbStub.called).to.be(true);
    });
});
