/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {_buildDcqlQueryForMdoc} from
  '../../../lib/workflows/common/oid4vp-shared.js';
import expect from 'expect.js';

const NS = 'org.iso.18013.5.1';
const exchange = {
  id: 'test-exchange',
  challenge: 'test-challenge',
  variables: {}
};

function mdocWorkflow(queryItem) {
  return {
    type: 'native',
    clientId: 'mdoc-dcql-test',
    query: [{format: ['mso_mdoc'], ...queryItem}]
  };
}

function claimsByPath(cred) {
  const map = new Map();
  for(const claim of cred.claims ?? []) {
    map.set(claim.path.join('/'), claim);
  }
  return map;
}

describe('_buildDcqlQueryForMdoc', () => {
  it('sets intent_to_retain false when workflow has only fields', async () => {
    const result = await _buildDcqlQueryForMdoc({
      workflow: mdocWorkflow({
        fields: {[NS]: ['given_name', 'family_name']}
      }),
      exchange
    });
    const cred = result.credentials[0];
    const byPath = claimsByPath(cred);
    expect(byPath.get(`${NS}/given_name`).intent_to_retain).to.be(false);
    expect(byPath.get(`${NS}/family_name`).intent_to_retain).to.be(false);
  });

  it('sets intent_to_retain true when workflow has only fieldsToRetain',
    async () => {
      const result = await _buildDcqlQueryForMdoc({
        workflow: mdocWorkflow({
          fieldsToRetain: {[NS]: ['given_name', 'document_number']}
        }),
        exchange
      });
      const cred = result.credentials[0];
      expect(cred.claims.map(c => c.path[1])).to.eql([
        'given_name', 'document_number'
      ]);
      for(const claim of cred.claims) {
        expect(claim.intent_to_retain).to.be(true);
      }
    });

  it('unions disjoint fields and fieldsToRetain with correct flags',
    async () => {
      const result = await _buildDcqlQueryForMdoc({
        workflow: mdocWorkflow({
          fields: {[NS]: ['given_name']},
          fieldsToRetain: {[NS]: ['document_number']}
        }),
        exchange
      });
      const cred = result.credentials[0];
      const byPath = claimsByPath(cred);
      expect(byPath.get(`${NS}/given_name`).intent_to_retain).to.be(false);
      expect(byPath.get(`${NS}/document_number`).intent_to_retain)
        .to.be(true);
      expect(cred.claims.length).to.eql(2);
    });

  it('sets intent_to_retain true for overlapping fields without dupes',
    async () => {
      const result = await _buildDcqlQueryForMdoc({
        workflow: mdocWorkflow({
          fields: {[NS]: ['family_name', 'given_name']},
          fieldsToRetain: {[NS]: ['family_name']}
        }),
        exchange
      });
      const cred = result.credentials[0];
      const byPath = claimsByPath(cred);
      expect(cred.claims.length).to.eql(2);
      expect(byPath.get(`${NS}/family_name`).intent_to_retain).to.be(true);
      expect(byPath.get(`${NS}/given_name`).intent_to_retain).to.be(false);
    });

  it('builds claims from fieldsToRetain when fields namespace is empty',
    async () => {
      const result = await _buildDcqlQueryForMdoc({
        workflow: mdocWorkflow({
          fields: {[NS]: []},
          fieldsToRetain: {[NS]: ['given_name']}
        }),
        exchange
      });
      const cred = result.credentials[0];
      expect(cred.claims).to.eql([{
        path: [NS, 'given_name'],
        intent_to_retain: true
      }]);
    });
});
