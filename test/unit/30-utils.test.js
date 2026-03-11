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
