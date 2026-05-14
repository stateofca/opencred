/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {
  clearTypeIriCache,
  expandTypes,
  getTypeIri
} from '../../../lib/workflows/common/type-expansion.js';

describe('Type Expansion', () => {
  beforeEach(() => {
    clearTypeIriCache();
  });

  describe('getTypeIri', () => {
    it('should expand VerifiableCredential to its full IRI', async () => {
      const iri = await getTypeIri({
        contexts: ['https://www.w3.org/ns/credentials/v2'],
        type: 'VerifiableCredential'
      });
      expect(iri).to.be(
        'https://www.w3.org/2018/credentials#VerifiableCredential'
      );
    });

    it('should throw for an undefined type', async () => {
      try {
        await getTypeIri({
          contexts: ['https://www.w3.org/ns/credentials/v2'],
          type: 'NonExistentType'
        });
        expect().fail('should have thrown');
      } catch(e) {
        expect(e.message).to.contain('not defined in the provided context');
      }
    });
  });

  describe('expandTypes', () => {
    it('should expand multiple types', async () => {
      const iris = await expandTypes({
        types: ['VerifiableCredential'],
        contexts: ['https://www.w3.org/ns/credentials/v2']
      });
      expect(iris).to.be.an('array');
      expect(iris.length).to.be(1);
      expect(iris[0]).to.be(
        'https://www.w3.org/2018/credentials#VerifiableCredential'
      );
    });

    it('should return empty array for empty types', async () => {
      const iris = await expandTypes({
        types: [],
        contexts: ['https://www.w3.org/ns/credentials/v2']
      });
      expect(iris).to.eql([]);
    });
  });

  describe('clearTypeIriCache', () => {
    it('should clear the cache without errors', async () => {
      await getTypeIri({
        contexts: ['https://www.w3.org/ns/credentials/v2'],
        type: 'VerifiableCredential'
      });
      clearTypeIriCache();
      // After clearing, the next call should still work (re-expands)
      const iri = await getTypeIri({
        contexts: ['https://www.w3.org/ns/credentials/v2'],
        type: 'VerifiableCredential'
      });
      expect(iri).to.be(
        'https://www.w3.org/2018/credentials#VerifiableCredential'
      );
    });
  });
});
