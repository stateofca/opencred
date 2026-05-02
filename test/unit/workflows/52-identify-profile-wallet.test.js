/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {expect} from 'chai';
import {getRequestHandler} from
  '../../../lib/workflows/common/oid4vp-dispatcher.js';
import {identifyProfile} from
  '../../../lib/workflows/common/identify-profile.js';

describe('wallet profile routing', () => {
  it('identifyProfile accepts cadmv-android with x509_san_dns, signed', () => {
    const out = identifyProfile({profile: 'cadmv-android'});
    expect(out.profile).to.equal('cadmv-android');
    expect(out.responseMode).to.equal('dc_api');
    expect(out.clientIdScheme).to.equal('x509_san_dns');
    expect(out.signed).to.equal(true);
  });

  it('identifyProfile accepts cadmv-ios with dc_api, signed', () => {
    const out = identifyProfile({profile: 'cadmv-ios'});
    expect(out.profile).to.equal('cadmv-ios');
    expect(out.responseMode).to.equal('dc_api');
    expect(out.signed).to.equal(true);
  });

  const namespaceWorkflow = {
    dcApiNamespaceQuery: {'org.iso.18013.5.1': ['family_name']}
  };

  it('cadmv-android with dcApiNamespaceQuery refines to D-spruceid', () => {
    const out = identifyProfile({
      profile: 'cadmv-android',
      workflow: namespaceWorkflow
    });
    expect(out.profile).to.equal('18013-7-Annex-D-spruceid');
    expect(out.responseMode).to.equal('dc_api');
    expect(out.clientIdScheme).to.equal('x509_san_dns');
    expect(out.signed).to.equal(true);
  });

  it('cadmv-ios with dcApiNamespaceQuery refines to C-spruceid', () => {
    const out = identifyProfile({
      profile: 'cadmv-ios',
      clientIdScheme: 'x509_san_dns',
      workflow: namespaceWorkflow
    });
    expect(out.profile).to.equal('18013-7-Annex-C-spruceid');
    expect(out.responseMode).to.equal('dc_api');
    expect(out.clientIdScheme).to.equal('x509_san_dns');
    expect(out.signed).to.equal(true);
  });

  it('18013-7-Annex-D without dcApiNamespaceQuery stays Annex-D', () => {
    const out = identifyProfile({
      profile: '18013-7-Annex-D',
      workflow: {}
    });
    expect(out.profile).to.equal('18013-7-Annex-D');
    expect(out.clientIdScheme).to.equal('x509_san_dns');
    expect(out.signed).to.equal(true);
  });

  it('18013-7-Annex-C without dcApiNamespaceQuery stays Annex-C', () => {
    const out = identifyProfile({
      profile: '18013-7-Annex-C',
      workflow: {}
    });
    expect(out.profile).to.equal('18013-7-Annex-C');
    expect(out.signed).to.equal(true);
  });

  it('18013-7-Annex-D with dcApiNamespaceQuery refines to D-spruceid', () => {
    const out = identifyProfile({
      profile: '18013-7-Annex-D',
      workflow: namespaceWorkflow
    });
    expect(out.profile).to.equal('18013-7-Annex-D-spruceid');
    expect(out.clientIdScheme).to.equal('x509_san_dns');
    expect(out.signed).to.equal(true);
  });

  it('18013-7-Annex-C with dcApiNamespaceQuery refines to C-spruceid', () => {
    const out = identifyProfile({
      profile: '18013-7-Annex-C',
      clientIdScheme: 'x509_san_dns',
      workflow: namespaceWorkflow
    });
    expect(out.profile).to.equal('18013-7-Annex-C-spruceid');
    expect(out.clientIdScheme).to.equal('x509_san_dns');
    expect(out.signed).to.equal(true);
  });

  it('identifyProfile accepts apple-wallet', () => {
    const out = identifyProfile({profile: 'apple-wallet'});
    expect(out.profile).to.equal('apple-wallet');
    expect(out.responseMode).to.equal('dc_api');
    expect(out.signed).to.equal(true);
  });

  it('identifyProfile accepts google-wallet with x509_hash', () => {
    const out = identifyProfile({profile: 'google-wallet'});
    expect(out.profile).to.equal('google-wallet');
    expect(out.responseMode).to.equal('dc_api.jwt');
    expect(out.clientIdScheme).to.equal('x509_hash');
    expect(out.signed).to.equal(true);
  });

  it('identifyProfile falls back on unknown values', () => {
    const out = identifyProfile({profile: 'mystery-profile'});
    expect(out.profile).to.equal('OID4VP-combined');
  });

  it('getRequestHandler maps cadmv-android to a handler', () => {
    const handler = getRequestHandler({profile: 'cadmv-android'});
    expect(handler).to.be.a('function');
  });

  it('getRequestHandler maps cadmv-ios to a handler', () => {
    const handler = getRequestHandler({profile: 'cadmv-ios'});
    expect(handler).to.be.a('function');
  });

  it('getRequestHandler maps google-wallet to a handler', () => {
    const handler = getRequestHandler({profile: 'google-wallet'});
    expect(handler).to.be.a('function');
  });

  it('getRequestHandler maps apple-wallet to a handler', () => {
    const handler = getRequestHandler({profile: 'apple-wallet'});
    expect(handler).to.be.a('function');
  });

  it('getRequestHandler returns standard for unknown profile', () => {
    const handler = getRequestHandler({profile: 'unknown-xyz'});
    expect(handler).to.be.a('function');
  });
});
