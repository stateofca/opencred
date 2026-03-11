/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {getProtocolInteractionMethods} from '../../../common/wallets/index.js';
import {interactionWallet} from '../../../common/wallets/protocols/index.js';

/** Very basic tests of structural composition, similar to what we would
 * get from a TypeScript interface.
*/
describe('Interaction Wallet Configuration', () => {
  describe('wallet structure', () => {
    it('should have required fields', () => {
      expect(interactionWallet).to.have.property('id');
      expect(interactionWallet).to.have.property('name');
      expect(interactionWallet).to.have.property('descriptionKey');
      expect(interactionWallet).to.have.property('supportedFormats');
      expect(interactionWallet).to.have.property('supportedProtocols');
    });

    it('should have correct id and name', () => {
      expect(interactionWallet.id).to.be('interaction');
      expect(interactionWallet.name).to.be('Interaction');
    });

    it('should have descriptionKey for i18n', () => {
      expect(interactionWallet.descriptionKey).to.be.a('string');
      expect(interactionWallet.descriptionKey.length).to.be.greaterThan(0);
    });

    it('should not have custom icon (uses generic)', () => {
      expect(interactionWallet).to.not.have.property('icon');
    });
  });

  describe('supportedFormats', () => {
    it('should contain all credential formats (format-agnostic URL)', () => {
      expect(interactionWallet.supportedFormats).to.be.an('array');
      expect(interactionWallet.supportedFormats).to.contain('ldp_vc');
      expect(interactionWallet.supportedFormats).to.contain('jwt_vc_json');
      expect(interactionWallet.supportedFormats).to.contain('mso_mdoc');
      expect(interactionWallet.supportedFormats.length).to.be(3);
    });
  });

  describe('protocol/interaction method combinations', () => {
    it('should support all formats + interact + copy', () => {
      const protocol = interactionWallet.supportedProtocols.interact;
      expect(protocol).to.be.an('object');
      expect(protocol.copy).to.be.an('object');
      expect(protocol.copy.formats).to.be.an('array');
      expect(protocol.copy.formats).to.contain('ldp_vc');
      expect(protocol.copy.formats).to.contain('jwt_vc_json');
      expect(protocol.copy.formats).to.contain('mso_mdoc');
      expect(protocol.copy.descriptionKey).to.be.a('string');
    });

    it('should support all formats + interact + qr', () => {
      const protocol = interactionWallet.supportedProtocols.interact;
      expect(protocol).to.be.an('object');
      expect(protocol.qr).to.be.an('object');
      expect(protocol.qr.formats).to.be.an('array');
      expect(protocol.qr.formats).to.contain('ldp_vc');
      expect(protocol.qr.formats).to.contain('jwt_vc_json');
      expect(protocol.qr.formats).to.contain('mso_mdoc');
      expect(protocol.qr.descriptionKey).to.be.a('string');
    });
  });

  describe('getProtocolInteractionMethods', () => {
    it('should return copy and qr for ldp_vc when interact URL available ' +
      'and wallet supports both copy and qr', () => {
      const exchange = {
        protocols: {
          interact: 'https://example.com/interact/123'
        }
      };
      const combinations = getProtocolInteractionMethods({
        walletId: 'interaction',
        format: 'ldp_vc',
        exchange
      });
      expect(combinations).to.be.an('array');
      expect(combinations.length).to.be.greaterThan(0);
      const copyCombo = combinations.find(c =>
        c.protocolId === 'interact' && c.interactionMethod === 'copy');
      const qrCombo = combinations.find(c =>
        c.protocolId === 'interact' && c.interactionMethod === 'qr');
      expect(copyCombo).to.be.an('object');
      expect(qrCombo).to.be.an('object');
      expect(copyCombo.request).to.be('https://example.com/interact/123');
      expect(qrCombo.request).to.be('https://example.com/interact/123');
    });

    it('should return copy and qr for jwt_vc_json when interact URL available',
      () => {
        const exchange = {
          protocols: {
            interact: 'https://example.com/interact/456'
          }
        };
        const combinations = getProtocolInteractionMethods({
          walletId: 'interaction',
          format: 'jwt_vc_json',
          exchange
        });
        expect(combinations).to.be.an('array');
        expect(combinations.length).to.be.greaterThan(0);
        const copyCombo = combinations.find(c =>
          c.protocolId === 'interact' && c.interactionMethod === 'copy');
        const qrCombo = combinations.find(c =>
          c.protocolId === 'interact' && c.interactionMethod === 'qr');
        expect(copyCombo).to.be.an('object');
        expect(qrCombo).to.be.an('object');
        expect(copyCombo.request).to.be('https://example.com/interact/456');
        expect(qrCombo.request).to.be('https://example.com/interact/456');
      });

    it('should return empty array when interact URL not available', () => {
      const exchange = {protocols: {}};
      const combinations = getProtocolInteractionMethods({
        walletId: 'interaction',
        format: 'ldp_vc',
        exchange
      });
      expect(combinations).to.be.an('array');
      expect(combinations.length).to.be(0);
    });
  });
});
