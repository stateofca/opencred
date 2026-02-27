/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {getProtocolInteractionMethods} from '../../../common/wallets/index.js';
import {vcalmInteractionWallet} from '../../../common/wallets/vcalm-interaction.js';

describe('VCALM Interaction Wallet Configuration', () => {
  describe('wallet structure', () => {
    it('should have required fields', () => {
      expect(vcalmInteractionWallet).to.have.property('id');
      expect(vcalmInteractionWallet).to.have.property('name');
      expect(vcalmInteractionWallet).to.have.property('description');
      expect(vcalmInteractionWallet).to.have.property('supportedFormats');
      expect(vcalmInteractionWallet).to.have.property('supportedProtocols');
    });

    it('should have correct id and name', () => {
      expect(vcalmInteractionWallet.id).to.be('vcalm-interaction');
      expect(vcalmInteractionWallet.name).to.be('VCALM Interaction');
    });

    it('should have description', () => {
      expect(vcalmInteractionWallet.description).to.be.a('string');
      expect(vcalmInteractionWallet.description.length).to.be.greaterThan(0);
    });

    it('should not have custom icon (uses generic)', () => {
      expect(vcalmInteractionWallet).to.not.have.property('icon');
    });
  });

  describe('supportedFormats', () => {
    it('should contain expected formats', () => {
      expect(vcalmInteractionWallet.supportedFormats).to.be.an('array');
      expect(vcalmInteractionWallet.supportedFormats).to.contain('ldp_vc');
      expect(vcalmInteractionWallet.supportedFormats.length).to.be(1);
    });
  });

  describe('protocol/interaction method combinations', () => {
    it('should support ldp_vc + interact + copy', () => {
      const protocol = vcalmInteractionWallet.supportedProtocols.interact;
      expect(protocol).to.be.an('object');
      expect(protocol.copy).to.be.an('object');
      expect(protocol.copy.formats).to.be.an('array');
      expect(protocol.copy.formats).to.contain('ldp_vc');
      expect(protocol.copy.description).to.be.a('string');
    });

    it('should support ldp_vc + interact + qr', () => {
      const protocol = vcalmInteractionWallet.supportedProtocols.interact;
      expect(protocol).to.be.an('object');
      expect(protocol.qr).to.be.an('object');
      expect(protocol.qr.formats).to.be.an('array');
      expect(protocol.qr.formats).to.contain('ldp_vc');
      expect(protocol.qr.description).to.be.a('string');
    });
  });

  describe('getProtocolInteractionMethods', () => {
    it('should return copy and qr for ldp_vc when interact URL available', () => {
      const exchange = {
        protocols: {
          interact: 'https://example.com/interact/123'
        }
      };
      const combinations = getProtocolInteractionMethods({
        walletId: 'vcalm-interaction',
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

    it('should return empty array when interact URL not available', () => {
      const exchange = {protocols: {}};
      const combinations = getProtocolInteractionMethods({
        walletId: 'vcalm-interaction',
        format: 'ldp_vc',
        exchange
      });
      expect(combinations).to.be.an('array');
      expect(combinations.length).to.be(0);
    });
  });
});
