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
      expect(appleWallet).to.have.property('supportedProtocols');
    });

    it('should have correct id and name', () => {
      expect(appleWallet.id).to.be('apple-wallet');
      expect(appleWallet.name).to.be('Apple Wallet');
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
    it('should support mso_mdoc + 18013-7-Annex-C + dcapi', () => {
      const protocol = appleWallet.supportedProtocols['18013-7-Annex-C'];
      expect(protocol).to.be.an('object');
      expect(protocol.dcapi).to.be.an('object');
      expect(protocol.dcapi.formats).to.be.an('array');
      expect(protocol.dcapi.formats).to.contain('mso_mdoc');
      expect(protocol.dcapi.formats.length).to.be(1);
      expect(protocol.dcapi.description).to.be.a('string');
    });
  });
});
