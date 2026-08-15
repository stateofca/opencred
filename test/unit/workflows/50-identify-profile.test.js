/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {identifyProfile} from
  '../../../lib/workflows/common/identify-profile.js';

describe('identify-profile', () => {
  describe('identifyProfile', () => {
    it('resolves 18013-7-Annex-D with default dc_api response mode', () => {
      const result = identifyProfile({
        profile: '18013-7-Annex-D',
        workflow: {}
      });
      expect(result.profile).to.equal('18013-7-Annex-D');
      expect(result.responseMode).to.equal('dc_api');
      expect(result.signed).to.be(true);
    });

    it('resolves 18013-7-Annex-C with default dc_api response mode', () => {
      const result = identifyProfile({
        profile: '18013-7-Annex-C',
        workflow: {}
      });
      expect(result.profile).to.equal('18013-7-Annex-C');
      expect(result.responseMode).to.equal('dc_api');
    });

    it('resolves OID4VP-HAIP-1.0 with default dc_api.jwt response mode',
      () => {
        const result = identifyProfile({
          profile: 'OID4VP-HAIP-1.0',
          workflow: {}
        });
        expect(result.profile).to.equal('OID4VP-HAIP-1.0');
        expect(result.responseMode).to.equal('dc_api.jwt');
      });

    it('honors explicit responseMode override for HAIP', () => {
      const result = identifyProfile({
        profile: 'OID4VP-HAIP-1.0',
        responseMode: 'dc_api',
        workflow: {}
      });
      expect(result.responseMode).to.equal('dc_api');
    });

    it('refines 18013-7-Annex-D to SpruceID when ' +
      'workflow.dcApiNamespaceQuery is present', () => {
      const result = identifyProfile({
        profile: '18013-7-Annex-D',
        workflow: {dcApiNamespaceQuery: {ns: 'org.iso.18013.5.1'}}
      });
      expect(result.profile).to.equal('18013-7-Annex-D-spruceid');
      expect(result.responseMode).to.equal('dc_api');
    });

    it('refines 18013-7-Annex-C to SpruceID when ' +
      'workflow.dcApiNamespaceQuery is present', () => {
      const result = identifyProfile({
        profile: '18013-7-Annex-C',
        workflow: {dcApiNamespaceQuery: {ns: 'org.iso.18013.5.1'}}
      });
      expect(result.profile).to.equal('18013-7-Annex-C-spruceid');
      expect(result.responseMode).to.equal('dc_api');
    });

    it('falls back to OID4VP-combined for an unknown profile', () => {
      const result = identifyProfile({
        profile: 'definitely-not-a-real-profile',
        workflow: {}
      });
      expect(result.profile).to.equal('OID4VP-combined');
      expect(result.signed).to.be(false);
    });

    it('maps legacy "OID4VP" alias to OID4VP-combined', () => {
      const result = identifyProfile({
        profile: 'OID4VP',
        workflow: {}
      });
      expect(result.profile).to.equal('OID4VP-combined');
    });

    it('defaults clientIdScheme to "did" for standard OID4VP profiles',
      () => {
        const result = identifyProfile({
          profile: 'OID4VP-1.0',
          workflow: {}
        });
        expect(result.clientIdScheme).to.equal('did');
      });

    it('forwards an explicit clientIdScheme parameter', () => {
      const result = identifyProfile({
        profile: 'OID4VP-1.0',
        clientIdScheme: 'x509_san_dns',
        workflow: {}
      });
      expect(result.clientIdScheme).to.equal('x509_san_dns');
    });

    it('defaults responseMode to direct_post for plain OID4VP profiles',
      () => {
        const result = identifyProfile({
          profile: 'OID4VP-1.0',
          workflow: {}
        });
        expect(result.responseMode).to.equal('direct_post');
      });

    it('honors dc_api response mode for plain OID4VP profiles', () => {
      const result = identifyProfile({
        profile: 'OID4VP-1.0',
        responseMode: 'dc_api',
        workflow: {}
      });
      expect(result.responseMode).to.equal('dc_api');
    });

    it('Annex-B uses direct_post regardless of input', () => {
      const result = identifyProfile({
        profile: '18013-7-Annex-B',
        responseMode: 'dc_api',
        workflow: {}
      });
      expect(result.profile).to.equal('18013-7-Annex-B');
      expect(result.responseMode).to.equal('direct_post');
    });

    it('uses workflow.oid4vpProfile when no profile is requested', () => {
      const result = identifyProfile({
        workflow: {oid4vpProfile: 'OID4VP-1.0'}
      });
      expect(result.profile).to.equal('OID4VP-1.0');
    });

    it('an explicit profile parameter overrides workflow.oid4vpProfile', () => {
      const result = identifyProfile({
        profile: 'OID4VP-draft18',
        workflow: {oid4vpProfile: 'OID4VP-1.0'}
      });
      expect(result.profile).to.equal('OID4VP-draft18');
    });
  });
});
