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
const AAMVA_NS = `${NS}.aamva`;
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

  it('merges base + AAMVA namespaces into a single mso_mdoc credential',
    async () => {
      const result = await _buildDcqlQueryForMdoc({
        workflow: mdocWorkflow({
          fields: {
            [NS]: ['family_name', 'given_name'],
            [AAMVA_NS]: ['organ_donor']
          }
        }),
        exchange
      });
      // one merged credential, not one credential per namespace
      expect(result.credentials.length).to.be(1);
      const cred = result.credentials[0];
      expect(cred.id).to.be('0');
      expect(cred.format).to.be('mso_mdoc');
      // base mDL doctype, not the bogus `<NS>.aamva.mDL`
      expect(cred.meta.doctype_value).to.be(`${NS}.mDL`);
      // claims span both namespaces
      const byPath = claimsByPath(cred);
      expect(cred.claims.length).to.be(3);
      expect(byPath.has(`${NS}/family_name`)).to.be(true);
      expect(byPath.has(`${NS}/given_name`)).to.be(true);
      expect(byPath.has(`${AAMVA_NS}/organ_donor`)).to.be(true);
      // a single credential id in credential_sets (no duplicate '0')
      expect(result.credential_sets[0].options[0]).to.eql(['0']);
    });

  it('picks the base namespace doctype regardless of namespace order',
    async () => {
      const result = await _buildDcqlQueryForMdoc({
        workflow: mdocWorkflow({
          // AAMVA sub-namespace listed first
          fields: {
            [AAMVA_NS]: ['organ_donor'],
            [NS]: ['given_name']
          }
        }),
        exchange
      });
      expect(result.credentials.length).to.be(1);
      expect(result.credentials[0].meta.doctype_value).to.be(`${NS}.mDL`);
    });

  it('stamps intent_to_retain per-namespace on the merged credential',
    async () => {
      const result = await _buildDcqlQueryForMdoc({
        workflow: mdocWorkflow({
          fields: {[NS]: ['given_name']},
          fieldsToRetain: {[AAMVA_NS]: ['organ_donor']}
        }),
        exchange
      });
      expect(result.credentials.length).to.be(1);
      const byPath = claimsByPath(result.credentials[0]);
      expect(byPath.get(`${NS}/given_name`).intent_to_retain).to.be(false);
      expect(byPath.get(`${AAMVA_NS}/organ_donor`).intent_to_retain)
        .to.be(true);
    });
});
