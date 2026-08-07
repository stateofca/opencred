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

// mso_mdoc query, so mdoc profiles (18013-7-Annex-*, cadmv-*) are enabled.
const mdocWorkflow = {
  type: 'native',
  clientId: 'connection-options-test',
  clientSecret: 'shh',
  query: [{
    format: ['mso_mdoc'],
    fields: {'org.iso.18013.5.1': ['given_name']}
  }]
};

// jwt_vc_json query, so OID4VP profiles are enabled but mdoc profiles are not.
const jwtWorkflow = {
  type: 'native',
  clientId: 'connection-options-jwt-test',
  clientSecret: 'shh',
  query: [{
    type: ['Iso18013DriversLicenseCredential'],
    format: ['jwt_vc_json']
  }]
};

function parse(connectionOptions, base = mdocWorkflow) {
  return NativeWorkflowSchema.safeParse({...base, connectionOptions});
}

function messages(result) {
  return result.error.issues.map(i => i.message).join('\n');
}

describe('workflow connectionOptions', () => {
  it('is optional', () => {
    const result = NativeWorkflowSchema.safeParse(mdocWorkflow);
    expect(result.success).to.be(true);
    expect(result.data.connectionOptions).to.be(undefined);
  });

  it('accepts the motivating CA DMV declaration: DC API then OID4VP ' +
    'QR-and-link', () => {
    const result = parse([
      {method: 'dcapi'},
      {method: 'qr-and-link', profile: 'OID4VP-combined'}
    ]);
    expect(result.success).to.be(true);
    expect(result.data.connectionOptions).to.eql([
      {method: 'dcapi'},
      {method: 'qr-and-link', profile: 'OID4VP-combined'}
    ]);
  });

  it('preserves declared order, which is significant', () => {
    const result = parse([
      {method: 'qr-and-link', profile: 'OID4VP-combined'},
      {method: 'dcapi', profile: '18013-7-Annex-D'}
    ]);
    expect(result.success).to.be(true);
    expect(result.data.connectionOptions.map(o => o.method))
      .to.eql(['qr-and-link', 'dcapi']);
  });

  it('accepts presentation and destination-label overrides', () => {
    const result = parse([{
      method: 'qr-and-link',
      profile: 'OID4VP-combined',
      label: 'Scan a QR code',
      labelKey: 'connect_qr_label',
      destinationLabel: 'another way',
      destinationLabelKey: 'switch_to_qr'
    }]);
    expect(result.success).to.be(true);
  });

  describe('the dcapi aggregator entry may omit profile', () => {
    it('accepts a dcapi entry with no profile', () => {
      expect(parse([{method: 'dcapi'}]).success).to.be(true);
    });

    it('rejects a non-dcapi method with no profile', () => {
      const result = parse([{method: 'qr-and-link'}]);
      expect(result.success).to.be(false);
      expect(messages(result)).to.contain('requires a `profile`');
    });
  });

  describe('unknown profile', () => {
    it('rejects an unknown profile name', () => {
      const result = parse([{method: 'dcapi', profile: 'nope'}]);
      expect(result.success).to.be(false);
      expect(messages(result)).to.contain('is not a known profile');
    });

    // A coherent method/profile pair whose format this workflow does not
    // request is a render-time SKIP, not a load failure — the same bargain
    // dcApiButtons struck. Config load accepts it; derivation omits it.
    it('accepts a coherent pair whose format the workflow does not ' +
      'request', () => {
      const result = parse(
        [{method: 'dcapi', profile: '18013-7-Annex-D'}], jwtWorkflow);
      expect(result.success).to.be(true);
    });

    it('accepts an OID4VP profile on a jwt_vc_json workflow', () => {
      const result = parse(
        [{method: 'qr-and-link', profile: 'OID4VP-combined'}], jwtWorkflow);
      expect(result.success).to.be(true);
    });
  });

  describe('method the profile does not offer', () => {
    it('rejects qr-and-link on a DC-API-only profile', () => {
      const result = parse(
        [{method: 'qr-and-link', profile: '18013-7-Annex-D'}]);
      expect(result.success).to.be(false);
      const text = messages(result);
      expect(text).to.contain('does not offer');
      expect(text).to.contain('qr-and-link');
    });

    it('rejects qr-and-copy on an OID4VP profile', () => {
      const result = parse(
        [{method: 'qr-and-copy', profile: 'OID4VP-combined'}]);
      expect(result.success).to.be(false);
      expect(messages(result)).to.contain('does not offer');
    });

    it('accepts dcapi on an OID4VP profile', () => {
      expect(parse([{method: 'dcapi', profile: 'OID4VP-combined'}]).success)
        .to.be(true);
    });
  });

  it('rejects a method outside the allowed enum', () => {
    expect(parse([{method: 'carrier-pigeon', profile: 'OID4VP-combined'}])
      .success).to.be(false);
  });

  it('is inheritable via configFrom', () => {
    expect(INHERITABLE_FIELDS).to.contain('connectionOptions');
  });
});
