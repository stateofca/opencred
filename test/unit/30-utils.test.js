/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {DidWebSchema} from '../../configs/configUtils.js';
import {normalizeVpTokenDataIntegrity} from '../../common/utils/vpToken.js';

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
