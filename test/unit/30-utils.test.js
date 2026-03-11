/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {DidWebSchema} from '../../configs/configUtils.js';
import {normalizeVpTokenDataIntegrity} from '../../common/utils/vpToken.js';
import {verifyUtils} from '../../common/utils.js';

describe('normalizeVpTokenDataIntegrity', () => {

  it('it should handle a JSON object and return an array with the \
object', () => {
    const vpObject = {test: 'data'};
    expect(normalizeVpTokenDataIntegrity(vpObject)).to.eql([vpObject]);
  });

  it('it should handle an array of JSON objects', () => {
    const vpObject1 = {test1: 'data1'};
    const vpObject2 = {test2: 'data2'};
    const vpArray = [vpObject1, vpObject2];
    expect(normalizeVpTokenDataIntegrity(vpArray)).to.eql([
      vpObject1,
      vpObject2
    ]);
  });

  it('it should return null for non-string, non-object, and non-array \
inputs', () => {
    const numberInput = 123;
    expect(normalizeVpTokenDataIntegrity(numberInput)).to.equal(null);
  });
});

describe('DidWebSchema', () => {
  const sampleDocument = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: 'did:web:example.com',
    verificationMethod: [{
      id: 'did:web:example.com#key-1',
      type: 'Ed25519VerificationKey2020'
    }]
  };

  it('should accept mainDocument as an object', () => {
    const result = DidWebSchema.parse({
      mainEnabled: true,
      mainDocument: sampleDocument
    });
    expect(result.mainDocument).to.eql(sampleDocument);
  });

  it('should accept mainDocument as a JSON string', () => {
    const result = DidWebSchema.parse({
      mainEnabled: true,
      mainDocument: JSON.stringify(sampleDocument)
    });
    expect(result.mainDocument).to.eql(sampleDocument);
  });

  it('should accept linkageDocument as an object', () => {
    const result = DidWebSchema.parse({
      linkageEnabled: true,
      linkageDocument: sampleDocument
    });
    expect(result.linkageDocument).to.eql(sampleDocument);
  });

  it('should accept linkageDocument as a JSON string', () => {
    const result = DidWebSchema.parse({
      linkageEnabled: true,
      linkageDocument: JSON.stringify(sampleDocument)
    });
    expect(result.linkageDocument).to.eql(sampleDocument);
  });

  it('should apply defaults when no documents are provided', () => {
    const result = DidWebSchema.parse({});
    expect(result.mainEnabled).to.be(false);
    expect(result.linkageEnabled).to.be(false);
    expect(result.mainDocument).to.be(undefined);
    expect(result.linkageDocument).to.be(undefined);
  });

  it('should throw on invalid JSON string for mainDocument', () => {
    expect(() => DidWebSchema.parse({
      mainDocument: 'not valid json'
    })).to.throwError();
  });
});

describe('checkVcQueryMatch presentation_definition (path parsing)', () => {
  it('should match VC when path $.type extracts field & filter matches', () => {
    const vc = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'IDCardCredential'],
      credentialSubject: {id: 'did:example:123'}
    };
    const presentation_definition = {
      id: 'test-pd',
      input_descriptors: [{
        id: 'id-card',
        constraints: {
          fields: [{
            path: ['$.type'],
            filter: {
              contains: {type: 'string', const: 'IDCardCredential'}
            }
          }]
        }
      }]
    };
    const result = verifyUtils.checkVcQueryMatch({
      vc,
      presentation_definition,
      presentation_submission: {}
    });
    expect(result).to.be(true);
  });

  it('matches VC when path $[\'@context\'] extracts field', () => {
    const vc = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://example.com/v1'
      ],
      type: ['VerifiableCredential'],
      credentialSubject: {id: 'did:example:123'}
    };
    const presentation_definition = {
      id: 'test-pd',
      input_descriptors: [{
        id: 'ctx-check',
        constraints: {
          fields: [{
            path: ['$[\'@context\']'],
            filter: {
              contains: {type: 'string', const: 'https://www.w3.org/2018/credentials/v1'}
            }
          }]
        }
      }]
    };
    const result = verifyUtils.checkVcQueryMatch({
      vc,
      presentation_definition,
      presentation_submission: {}
    });
    expect(result).to.be(true);
  });

  it('does not match when filter does not match extracted field', () => {
    const vc = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential'],
      credentialSubject: {id: 'did:example:123'}
    };
    const presentation_definition = {
      id: 'test-pd',
      input_descriptors: [{
        id: 'id-card',
        constraints: {
          fields: [{
            path: ['$.type'],
            filter: {
              contains: {type: 'string', const: 'IDCardCredential'}
            }
          }]
        }
      }]
    };
    const result = verifyUtils.checkVcQueryMatch({
      vc,
      presentation_definition,
      presentation_submission: {}
    });
    expect(result).to.be(false);
  });

  it('should handle path as single string', () => {
    const vc = {
      type: ['VerifiableCredential', 'TestCredential'],
      credentialSubject: {}
    };
    const presentation_definition = {
      id: 'test-pd',
      input_descriptors: [{
        id: 'single-path',
        constraints: {
          fields: [{
            path: '$.type',
            filter: {
              contains: {type: 'string', const: 'TestCredential'}
            }
          }]
        }
      }]
    };
    const result = verifyUtils.checkVcQueryMatch({
      vc,
      presentation_definition,
      presentation_submission: {}
    });
    expect(result).to.be(true);
  });
});

describe('getVerifyPresentationDataIntegrityErrors', () => {
  it('should return empty array when all verified', () => {
    const vpResult = {
      presentationResult: {
        results: [{verified: true}]
      },
      credentialResults: [{
        verified: true,
        results: [{verified: true}]
      }]
    };
    const errors =
      verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult);
    expect(errors).to.eql([]);
  });

  it('should extract presentation-level error', () => {
    const vpResult = {
      presentationResult: {
        results: [{
          verified: false,
          error: {message: 'Proof verification failed'}
        }]
      },
      credentialResults: [{
        verified: true,
        results: [{verified: true}]
      }]
    };
    const errors =
      verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult);
    expect(errors).to.have.length(1);
    expect(errors[0]).to.contain('Proof verification failed');
    expect(errors[0]).to.contain('(Presentation)');
  });

  it('should extract credential-level error with message', () => {
    const vpResult = {
      presentationResult: {
        results: [{verified: true}]
      },
      credentialResults: [{
        verified: false,
        results: [{
          verified: false,
          error: {message: 'Proof verification failed'}
        }]
      }]
    };
    const errors =
      verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult);
    expect(errors).to.have.length(1);
    expect(errors[0]).to.contain('Proof verification failed');
  });

  it('should handle credential error with empty object', () => {
    const vpResult = {
      presentationResult: {
        results: [{verified: true}]
      },
      credentialResults: [{
        verified: false,
        results: [{
          verified: false,
          error: {}
        }]
      }]
    };
    const errors =
      verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult);
    // Empty error object should be filtered out, resulting in empty string
    // which gets filtered out of the final array
    expect(errors).to.eql([]);
  });

  it('should handle credential error with undefined error', () => {
    const vpResult = {
      presentationResult: {
        results: [{verified: true}]
      },
      credentialResults: [{
        verified: false,
        results: [{
          verified: false,
          error: undefined
        }]
      }]
    };
    const errors =
      verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult);
    // Undefined error.message should be filtered out
    expect(errors).to.eql([]);
  });

  it('should extract status error for revoked credential', () => {
    const vpResult = {
      presentationResult: {
        results: [{verified: true}]
      },
      credentialResults: [{
        verified: true,
        results: [{verified: true}],
        statusResult: {
          verified: true,
          results: [{
            verified: true,
            credentialStatus: {
              id: 'https://example.com/status#123',
              statusPurpose: 'revocation'
            },
            status: true
          }]
        }
      }]
    };
    const errors =
      verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult);
    expect(errors).to.have.length(1);
    expect(errors[0]).to.contain('revoked');
  });

  it('should extract status error for unverified status', () => {
    const vpResult = {
      presentationResult: {
        results: [{verified: true}]
      },
      credentialResults: [{
        verified: true,
        results: [{verified: true}],
        statusResult: {
          verified: false
        }
      }]
    };
    const errors =
      verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult);
    expect(errors).to.have.length(1);
    expect(errors[0]).to.contain('status credential could not be verified');
  });

  it('should extract status errors array', () => {
    const vpResult = {
      presentationResult: {
        results: [{verified: true}]
      },
      credentialResults: [{
        verified: true,
        results: [{verified: true}],
        statusResult: {
          errors: ['Status check failed', 'Network error']
        }
      }]
    };
    const errors =
      verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult);
    expect(errors).to.have.length(1);
    expect(errors[0]).to.contain('Status check failed');
    expect(errors[0]).to.contain('Network error');
  });

  it('should combine multiple error types', () => {
    const vpResult = {
      presentationResult: {
        results: [{
          verified: false,
          error: {message: 'Presentation proof failed'}
        }]
      },
      credentialResults: [{
        verified: false,
        results: [{
          verified: false,
          error: {message: 'Credential proof failed'}
        }],
        statusResult: {
          verified: false
        }
      }]
    };
    const errors =
      verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult);
    expect(errors.length).to.be.greaterThan(0);
    expect(errors.some(e =>
      e.includes('Presentation proof failed'))).to.be(true);
    expect(errors.some(e => e.includes('Credential proof failed'))).to.be(true);
    expect(errors.some(e => e.includes('status credential'))).to.be(true);
  });

  it('should throw when presentationResult is missing', () => {
    const vpResult = {
      credentialResults: []
    };
    expect(() => {
      verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult);
    }).to.throwError();
  });

  it('should handle multiple unverified credentials', () => {
    const vpResult = {
      presentationResult: {
        results: [{verified: true}]
      },
      credentialResults: [
        {
          verified: false,
          results: [{
            verified: false,
            error: {message: 'First credential failed'}
          }]
        },
        {
          verified: false,
          results: [{
            verified: false,
            error: {message: 'Second credential failed'}
          }]
        }
      ]
    };
    const errors =
      verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult);
    expect(errors).to.have.length(1);
    expect(errors[0]).to.contain('First credential failed');
    expect(errors[0]).to.contain('Second credential failed');
  });
});
