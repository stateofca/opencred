/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {cadmvAndroidWallet} from '../../../common/wallets/cadmv-android.js';
import {cadmvIosWallet} from '../../../common/wallets/cadmv-ios.js';

describe('CA DMV Android Wallet Configuration', () => {
  describe('wallet structure', () => {
    it('should have required fields', () => {
      expect(cadmvAndroidWallet).to.have.property('id');
      expect(cadmvAndroidWallet).to.have.property('name');
      expect(cadmvAndroidWallet).to.have.property('description');
      expect(cadmvAndroidWallet).to.have.property('supportedFormats');
      expect(cadmvAndroidWallet).to.have.property('supportedProtocols');
    });

    it('should have correct id and platform', () => {
      expect(cadmvAndroidWallet.id).to.be('cadmv-android');
      expect(cadmvAndroidWallet.platform).to.eql(['android']);
    });
  });

  describe('supportedFormats', () => {
    it('should contain mso_mdoc only', () => {
      expect(cadmvAndroidWallet.supportedFormats).to.be.an('array');
      expect(cadmvAndroidWallet.supportedFormats).to.contain('mso_mdoc');
      expect(cadmvAndroidWallet.supportedFormats.length).to.be(1);
    });
  });

  describe('protocol/interaction method combinations', () => {
    it('should support mso_mdoc + cadmv-android + dcapi', () => {
      const protocol = cadmvAndroidWallet.supportedProtocols['cadmv-android'];
      expect(protocol).to.be.an('object');
      expect(protocol.dcapi).to.be.an('object');
      expect(protocol.dcapi.formats).to.contain('mso_mdoc');
    });
  });
});

describe('CA DMV iOS Wallet Configuration', () => {
  describe('wallet structure', () => {
    it('should have required fields', () => {
      expect(cadmvIosWallet).to.have.property('id');
      expect(cadmvIosWallet).to.have.property('name');
      expect(cadmvIosWallet).to.have.property('description');
      expect(cadmvIosWallet).to.have.property('supportedFormats');
      expect(cadmvIosWallet).to.have.property('supportedProtocols');
    });

    it('should have correct id and platform', () => {
      expect(cadmvIosWallet.id).to.be('cadmv-ios');
      expect(cadmvIosWallet.platform).to.eql(['ios']);
    });
  });

  describe('supportedFormats', () => {
    it('should contain mso_mdoc only', () => {
      expect(cadmvIosWallet.supportedFormats).to.be.an('array');
      expect(cadmvIosWallet.supportedFormats).to.contain('mso_mdoc');
      expect(cadmvIosWallet.supportedFormats.length).to.be(1);
    });
  });

  describe('protocol/interaction method combinations', () => {
    it('should support mso_mdoc + cadmv-ios + dcapi', () => {
      const protocol = cadmvIosWallet.supportedProtocols['cadmv-ios'];
      expect(protocol).to.be.an('object');
      expect(protocol.dcapi).to.be.an('object');
      expect(protocol.dcapi.formats).to.contain('mso_mdoc');
    });
  });
});
