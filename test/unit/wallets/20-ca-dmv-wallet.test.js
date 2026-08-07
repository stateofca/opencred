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
      expect(cadmvAndroidWallet).to.have.property('supportedProfiles');
    });

    it('should have correct id and platform', () => {
      expect(cadmvAndroidWallet.id).to.be('cadmv-android');
      expect(cadmvAndroidWallet.platform).to.eql(['android']);
    });

    it('should carry a platform device-context name and a shared ' +
      'product name', () => {
      expect(cadmvAndroidWallet.name).to.be('CA DMV Wallet on Android');
      expect(cadmvAndroidWallet.productName).to.be('CA DMV Wallet');
    });
  });

  describe('supportedFormats', () => {
    it('should include mDL and OID4VP VC formats', () => {
      expect(cadmvAndroidWallet.supportedFormats).to.be.an('array');
      expect(cadmvAndroidWallet.supportedFormats).to.contain('mso_mdoc');
      expect(cadmvAndroidWallet.supportedFormats).to.contain('jwt_vc_json');
      expect(cadmvAndroidWallet.supportedFormats).to.contain('ldp_vc');
    });
  });

  describe('protocol/interaction method combinations', () => {
    it('should support mso_mdoc + cadmv-android + dcapi', () => {
      const protocol = cadmvAndroidWallet.supportedProfiles['cadmv-android'];
      expect(protocol).to.be.an('object');
      expect(protocol.dcapi).to.be.an('object');
      expect(protocol.dcapi.formats).to.contain('mso_mdoc');
    });

    describe('OID4VP profiles', () => {
      for(const profileId of ['OID4VP-1.0', 'OID4VP-draft18']) {
        it(
          `should support ${profileId} qr, link + jwt_vc_json/ldp_vc`,
          () => {
            const profile = cadmvAndroidWallet.supportedProfiles[profileId];
            expect(profile).to.be.an('object');
            expect(profile.qr).to.be.an('object');
            expect(profile.link).to.be.an('object');
            expect(profile.qr.formats).to.eql(['jwt_vc_json', 'ldp_vc']);
            expect(profile.link.formats).to.eql(['jwt_vc_json', 'ldp_vc']);
          });
      }
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
      expect(cadmvIosWallet).to.have.property('supportedProfiles');
    });

    it('should have correct id and platform', () => {
      expect(cadmvIosWallet.id).to.be('cadmv-ios');
      expect(cadmvIosWallet.platform).to.eql(['ios']);
    });

    it('should carry a platform device-context name and a shared ' +
      'product name', () => {
      expect(cadmvIosWallet.name).to.be('CA DMV Wallet on iOS');
      expect(cadmvIosWallet.productName).to.be('CA DMV Wallet');
    });
  });

  describe('supportedFormats', () => {
    it('should include mDL and OID4VP VC formats', () => {
      expect(cadmvIosWallet.supportedFormats).to.be.an('array');
      expect(cadmvIosWallet.supportedFormats).to.contain('mso_mdoc');
      expect(cadmvIosWallet.supportedFormats).to.contain('jwt_vc_json');
      expect(cadmvIosWallet.supportedFormats).to.contain('ldp_vc');
    });
  });

  describe('protocol/interaction method combinations', () => {
    it('should support mso_mdoc + cadmv-ios + dcapi', () => {
      const protocol = cadmvIosWallet.supportedProfiles['cadmv-ios'];
      expect(protocol).to.be.an('object');
      expect(protocol.dcapi).to.be.an('object');
      expect(protocol.dcapi.formats).to.contain('mso_mdoc');
    });

    describe('OID4VP profiles', () => {
      for(const profileId of ['OID4VP-1.0', 'OID4VP-draft18']) {
        it(
          `should support ${profileId} qr, link + jwt_vc_json/ldp_vc`,
          () => {
            const profile = cadmvIosWallet.supportedProfiles[profileId];
            expect(profile).to.be.an('object');
            expect(profile.qr).to.be.an('object');
            expect(profile.link).to.be.an('object');
            expect(profile.qr.formats).to.eql(['jwt_vc_json', 'ldp_vc']);
            expect(profile.link.formats).to.eql(['jwt_vc_json', 'ldp_vc']);
          });
      }
    });
  });
});
