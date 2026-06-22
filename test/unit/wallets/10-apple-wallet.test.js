/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {appleWallet} from '../../../common/wallets/apple-wallet.js';

/** Very basic tests of structural composition, similar to what we would
 * get from a TypeScript interface.
*/
describe('Apple Wallet Configuration', () => {
  describe('wallet structure', () => {
    it('should have required fields', () => {
      expect(appleWallet).to.have.property('id');
      expect(appleWallet).to.have.property('name');
      expect(appleWallet).to.have.property('description');
      expect(appleWallet).to.have.property('supportedFormats');
      expect(appleWallet).to.have.property('supportedProfiles');
    });

    it('should have correct id and name', () => {
      expect(appleWallet.id).to.be('apple-wallet');
      expect(appleWallet.name).to.be('Digital Wallet on Apple Device');
    });

    it('should have description', () => {
      expect(appleWallet.description).to.be.a('string');
      expect(appleWallet.description.length).to.be.greaterThan(0);
    });
  });

  describe('supportedFormats', () => {
    it('should contain expected formats', () => {
      expect(appleWallet.supportedFormats).to.be.an('array');
      expect(appleWallet.supportedFormats).to.contain('mso_mdoc');
      expect(appleWallet.supportedFormats.length).to.be(1);
    });
  });

  describe('protocol/interaction method combination', () => {
    it('should list apple-wallet profile before 18013-7-Annex-C', () => {
      const keys = Object.keys(appleWallet.supportedProfiles);
      expect(keys[0]).to.be('apple-wallet');
      expect(keys).to.contain('18013-7-Annex-C');
    });

    it('should support mso_mdoc + apple-wallet + dcapi', () => {
      const protocol = appleWallet.supportedProfiles['apple-wallet'];
      expect(protocol).to.be.an('object');
      expect(protocol.dcapi).to.be.an('object');
      expect(protocol.dcapi.formats).to.be.an('array');
      expect(protocol.dcapi.formats).to.contain('mso_mdoc');
      expect(protocol.dcapi.formats.length).to.be(1);
      expect(protocol.dcapi.description).to.be.a('string');
    });

    it('should support mso_mdoc + 18013-7-Annex-C + dcapi', () => {
      const protocol = appleWallet.supportedProfiles['18013-7-Annex-C'];
      expect(protocol).to.be.an('object');
      expect(protocol.dcapi).to.be.an('object');
      expect(protocol.dcapi.formats).to.be.an('array');
      expect(protocol.dcapi.formats).to.contain('mso_mdoc');
      expect(protocol.dcapi.formats.length).to.be(1);
      expect(protocol.dcapi.description).to.be.a('string');
    });
  });

  describe('storefronts', () => {
    it('should have storefronts array', () => {
      expect(appleWallet).to.have.property('storefronts');
      expect(appleWallet.storefronts).to.be.an('array');
      expect(appleWallet.storefronts.length).to.be(1);
    });

    it('should have Apple App Store storefront', () => {
      const as = appleWallet.storefronts.find(s => s.type === 'apple');
      expect(as).to.be.an('object');
      expect(as.url).to.contain('apps.apple.com');
    });
  });
});
