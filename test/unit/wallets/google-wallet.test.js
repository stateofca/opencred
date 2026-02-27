/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {googleWallet} from '../../../common/wallets/google-wallet.js';

describe('Google Wallet Configuration', () => {
  describe('wallet structure', () => {
    it('should have required fields', () => {
      expect(googleWallet).to.have.property('id');
      expect(googleWallet).to.have.property('name');
      expect(googleWallet).to.have.property('description');
      expect(googleWallet).to.have.property('supportedFormats');
      expect(googleWallet).to.have.property('supportedProtocols');
    });

    it('should have correct id and name', () => {
      expect(googleWallet.id).to.be('google-wallet');
      expect(googleWallet.name).to.be('Google Wallet');
    });

    it('should have description', () => {
      expect(googleWallet.description).to.be.a('string');
      expect(googleWallet.description.length).to.be.greaterThan(0);
    });
  });

  describe('supportedFormats', () => {
    it('should contain expected formats', () => {
      expect(googleWallet.supportedFormats).to.be.an('array');
      expect(googleWallet.supportedFormats).to.contain('mso_mdoc');
      expect(googleWallet.supportedFormats.length).to.be(1);
    });
  });

  describe('protocol/interaction method combination', () => {
    it('should support mso_mdoc + 18013-7-Annex-D + dcapi', () => {
      const protocol = googleWallet.supportedProtocols['18013-7-Annex-D'];
      expect(protocol).to.be.an('object');
      expect(protocol.dcapi).to.be.an('object');
      expect(protocol.dcapi.formats).to.be.an('array');
      expect(protocol.dcapi.formats).to.contain('mso_mdoc');
      expect(protocol.dcapi.formats.length).to.be(1);
      expect(protocol.dcapi.description).to.be.a('string');
    });
  });
});
