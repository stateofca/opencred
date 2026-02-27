/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {caDmvWallet} from '../../../common/wallets/ca-dmv-wallet.js';

/** Very basic tests of structural composition, similar to what we would
 * get from a TypeScript interface.
*/
describe('CA DMV Wallet Configuration', () => {
  describe('wallet structure', () => {
    it('should have required fields', () => {
      expect(caDmvWallet).to.have.property('id');
      expect(caDmvWallet).to.have.property('name');
      expect(caDmvWallet).to.have.property('description');
      expect(caDmvWallet).to.have.property('supportedFormats');
      expect(caDmvWallet).to.have.property('supportedProtocols');
    });

    it('should have correct id and name', () => {
      expect(caDmvWallet.id).to.be('cadmv-wallet');
      expect(caDmvWallet.name).to.be('CA DMV Wallet');
    });

    it('should have description', () => {
      expect(caDmvWallet.description).to.be.a('string');
      expect(caDmvWallet.description.length).to.be.greaterThan(0);
    });
  });

  describe('supportedFormats', () => {
    it('should contain expected formats', () => {
      expect(caDmvWallet.supportedFormats).to.be.an('array');
      expect(caDmvWallet.supportedFormats).to.contain('mso_mdoc');
      expect(caDmvWallet.supportedFormats).to.contain('ldp_vc');
      expect(caDmvWallet.supportedFormats).to.contain('jwt_vc_json');
      expect(caDmvWallet.supportedFormats.length).to.be(3);
    });
  });

  describe('protocol/interaction method combinations', () => {
    it('should support mso_mdoc + 18013-7-Annex-D + dcapi', () => {
      const protocol = caDmvWallet.supportedProtocols['18013-7-Annex-D'];
      expect(protocol).to.be.an('object');
      expect(protocol.dcapi).to.be.an('object');
      expect(protocol.dcapi.formats).to.be.an('array');
      expect(protocol.dcapi.formats).to.contain('mso_mdoc');
      expect(protocol.dcapi.description).to.be.a('string');
    });

    it('should support ldp_vc + OID4VP-draft18 + qr', () => {
      const protocol = caDmvWallet.supportedProtocols['OID4VP-draft18'];
      expect(protocol).to.be.an('object');
      expect(protocol.qr).to.be.an('object');
      expect(protocol.qr.formats).to.be.an('array');
      expect(protocol.qr.formats).to.contain('ldp_vc');
      expect(protocol.qr.description).to.be.a('string');
    });

    it('should support ldp_vc + OID4VP-draft18 + link', () => {
      const protocol = caDmvWallet.supportedProtocols['OID4VP-draft18'];
      expect(protocol).to.be.an('object');
      expect(protocol.link).to.be.an('object');
      expect(protocol.link.formats).to.be.an('array');
      expect(protocol.link.formats).to.contain('ldp_vc');
      expect(protocol.link.description).to.be.a('string');
    });

    it('should support jwt_vc_json + OID4VP-draft18 + qr', () => {
      const protocol = caDmvWallet.supportedProtocols['OID4VP-draft18'];
      expect(protocol).to.be.an('object');
      expect(protocol.qr).to.be.an('object');
      expect(protocol.qr.formats).to.be.an('array');
      expect(protocol.qr.formats).to.contain('jwt_vc_json');
    });

    it('should support jwt_vc_json + OID4VP-draft18 + link', () => {
      const protocol = caDmvWallet.supportedProtocols['OID4VP-draft18'];
      expect(protocol).to.be.an('object');
      expect(protocol.link).to.be.an('object');
      expect(protocol.link.formats).to.be.an('array');
      expect(protocol.link.formats).to.contain('jwt_vc_json');
    });

    it('should have correct formats arrays for OID4VP-draft18', () => {
      const protocol = caDmvWallet.supportedProtocols['OID4VP-draft18'];
      expect(protocol.qr.formats).to.contain('ldp_vc');
      expect(protocol.qr.formats).to.contain('jwt_vc_json');
      expect(protocol.qr.formats.length).to.be(2);
      expect(protocol.link.formats).to.contain('ldp_vc');
      expect(protocol.link.formats).to.contain('jwt_vc_json');
      expect(protocol.link.formats.length).to.be(2);
    });
  });

  describe('getUrl functions', () => {
    it('should use default getUrl for qr method', () => {
      const protocol = caDmvWallet.supportedProtocols['OID4VP-draft18'];
      // getUrl should be undefined (will use default from helper)
      expect(protocol.qr.getUrl).to.be(undefined);
    });

    it('should use default getUrl for link method', () => {
      const protocol = caDmvWallet.supportedProtocols['OID4VP-draft18'];
      // getUrl should be undefined (will use default from helper)
      expect(protocol.link.getUrl).to.be(undefined);
    });
  });
});
