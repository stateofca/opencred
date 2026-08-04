/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  INHERITABLE_FIELDS,
  NativeWorkflowSchema
} from '../../../configs/config-utils.js';

import expect from 'expect.js';

const baseWorkflow = {
  type: 'native',
  clientId: 'dc-api-buttons-test',
  clientSecret: 'shh',
  query: [{
    format: ['mso_mdoc'],
    fields: {'org.iso.18013.5.1': ['given_name']}
  }]
};

function parse(dcApiButtons, overrides = {}) {
  return NativeWorkflowSchema.safeParse({
    ...baseWorkflow, ...overrides, dcApiButtons
  });
}

function messages(result) {
  return result.error.issues.map(i => i.message).join('\n');
}

describe('workflow dcApiButtons', () => {
  it('is optional', () => {
    const result = NativeWorkflowSchema.safeParse(baseWorkflow);
    expect(result.success).to.be(true);
    expect(result.data.dcApiButtons).to.be(undefined);
  });

  it('accepts an Apple + Google button, the motivating configuration', () => {
    const result = parse([{
      id: 'mdl',
      labelKey: 'walletButton_presentMdl',
      profiles: ['apple-wallet', 'google-wallet']
    }]);
    expect(result.success).to.be(true);
    expect(result.data.dcApiButtons[0].profiles)
      .to.eql(['apple-wallet', 'google-wallet']);
  });

  it('preserves configured profile order, which is significant', () => {
    const result = parse([{
      id: 'mdl',
      label: 'Present mDL',
      profiles: ['google-wallet', 'apple-wallet']
    }]);
    expect(result.success).to.be(true);
    expect(result.data.dcApiButtons[0].profiles)
      .to.eql(['google-wallet', 'apple-wallet']);
  });

  it('accepts a literal label instead of a labelKey', () => {
    expect(parse([{
      id: 'mdl', label: 'Open in wallet', profiles: ['apple-wallet']
    }]).success).to.be(true);
  });

  it('rejects an entry with neither label nor labelKey', () => {
    const result = parse([{id: 'mdl', profiles: ['apple-wallet']}]);
    expect(result.success).to.be(false);
    expect(messages(result)).to.contain('requires `label` or `labelKey`');
  });

  it('rejects an empty profiles array', () => {
    expect(parse([{
      id: 'mdl', label: 'x', profiles: []
    }]).success).to.be(false);
  });

  it('rejects a duplicate button id', () => {
    const result = parse([
      {id: 'mdl', label: 'One', profiles: ['apple-wallet']},
      {id: 'mdl', label: 'Two', profiles: ['google-wallet']}
    ]);
    expect(result.success).to.be(false);
    expect(messages(result)).to.contain('duplicate id');
  });

  it('rejects an id with characters that are unsafe as a DOM key', () => {
    expect(parse([{
      id: 'has spaces', label: 'x', profiles: ['apple-wallet']
    }]).success).to.be(false);
  });

  describe('DC API profile requirement', () => {
    it('rejects a profile that emits a JAR JWT rather than a DC API ' +
      'envelope', () => {
      const result = parse([{
        id: 'mixed',
        label: 'Mixed',
        profiles: ['apple-wallet', '18013-7-Annex-B']
      }]);
      expect(result.success).to.be(false);
      expect(messages(result)).to.contain('is not a DC API profile');
    });

    // identifyProfile silently falls back to the default OID4VP profile for an
    // unrecognized name, so a typo must surface as the CONFIGURED name or the
    // error is unintelligible.
    it('reports the configured name, and the resolved name, for a typo', () => {
      const result = parse([{
        id: 'typo', label: 'Typo', profiles: ['aple-wallet']
      }]);
      expect(result.success).to.be(false);
      const text = messages(result);
      expect(text).to.contain('"aple-wallet"');
      expect(text).to.contain('resolved to');
      expect(text).to.contain('is not a DC API profile');
    });
  });

  describe('same-protocol collision ban', () => {
    it('rejects two profiles that both emit openid4vp-v1-signed', () => {
      const result = parse([{
        id: 'dup',
        label: 'Duplicate format',
        profiles: ['google-wallet', '18013-7-Annex-D']
      }]);
      expect(result.success).to.be(false);
      const text = messages(result);
      expect(text).to.contain('openid4vp-v1-signed');
      expect(text).to.contain('same wire format twice');
    });

    it('rejects two profiles that both emit org-iso-mdoc', () => {
      const result = parse([{
        id: 'dup',
        label: 'Duplicate format',
        profiles: ['apple-wallet', 'cadmv-ios']
      }]);
      expect(result.success).to.be(false);
      expect(messages(result)).to.contain('org-iso-mdoc');
    });

    // The reason validation resolves through identifyProfile first: with a
    // namespace query, cadmv-ios and 18013-7-Annex-C both redirect to
    // 18013-7-Annex-C-spruceid, so a collision only appears after resolution.
    it('catches a collision that only exists after the spruceid redirect',
      () => {
        const result = parse([{
          id: 'redirected',
          label: 'Redirected',
          profiles: ['cadmv-ios', '18013-7-Annex-C']
        }], {dcApiNamespaceQuery: {'org.iso.18013.5.1': ['given_name']}});
        expect(result.success).to.be(false);
        expect(messages(result)).to.contain('same wire format twice');
      });

    it('allows the same pair across two separate buttons', () => {
      const result = parse([
        {id: 'apple', label: 'Apple', profiles: ['apple-wallet']},
        {id: 'google', label: 'Google', profiles: ['google-wallet']}
      ]);
      expect(result.success).to.be(true);
    });
  });

  it('is inheritable via configFrom', () => {
    expect(INHERITABLE_FIELDS).to.contain('dcApiButtons');
  });
});
