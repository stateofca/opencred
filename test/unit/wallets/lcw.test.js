/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {lcwWallet} from '../../../common/wallets/lcw.js';

/** Very basic tests of structural composition, similar to what we would
 * get from a TypeScript interface.
*/
describe('LCW Wallet Configuration', () => {
  describe('wallet structure', () => {
    it('should have required fields', () => {
      expect(lcwWallet).to.have.property('id');
      expect(lcwWallet).to.have.property('name');
      expect(lcwWallet).to.have.property('description');
      expect(lcwWallet).to.have.property('supportedFormats');
      expect(lcwWallet).to.have.property('supportedProtocols');
    });

    it('should have correct id and name', () => {
      expect(lcwWallet.id).to.be('lcw');
      expect(lcwWallet.name).to.be('Learner Credential Wallet');
    });

    it('should have description', () => {
      expect(lcwWallet.description).to.be.a('string');
      expect(lcwWallet.description.length).to.be.greaterThan(0);
    });
  });

  describe('supportedFormats', () => {
    it('should contain expected formats', () => {
      expect(lcwWallet.supportedFormats).to.be.an('array');
      expect(lcwWallet.supportedFormats).to.contain('ldp_vc');
      expect(lcwWallet.supportedFormats.length).to.be(1);
    });
  });

  describe('protocol/interaction method combinations', () => {
    it('should support ldp_vc + vcapi + qr', () => {
      const protocol = lcwWallet.supportedProtocols.vcapi;
      expect(protocol).to.be.an('object');
      expect(protocol.qr).to.be.an('object');
      expect(protocol.qr.formats).to.be.an('array');
      expect(protocol.qr.formats).to.contain('ldp_vc');
      expect(protocol.qr.description).to.be.a('string');
      expect(protocol.qr.getUrl).to.be.a('function');
    });

    it('should support ldp_vc + vcapi + link', () => {
      const protocol = lcwWallet.supportedProtocols.vcapi;
      expect(protocol).to.be.an('object');
      expect(protocol.link).to.be.an('object');
      expect(protocol.link.formats).to.be.an('array');
      expect(protocol.link.formats).to.contain('ldp_vc');
      expect(protocol.link.description).to.be.a('string');
      expect(protocol.link.getUrl).to.be.a('function');
    });

    it('should support ldp_vc + vcapi + copy', () => {
      const protocol = lcwWallet.supportedProtocols.vcapi;
      expect(protocol).to.be.an('object');
      expect(protocol.copy).to.be.an('object');
      expect(protocol.copy.formats).to.be.an('array');
      expect(protocol.copy.formats).to.contain('ldp_vc');
      expect(protocol.copy.description).to.be.a('string');
      expect(protocol.copy.getUrl).to.be.a('function');
    });

    it('should support ldp_vc + chapi + chapi', () => {
      const protocol = lcwWallet.supportedProtocols.chapi;
      expect(protocol).to.be.an('object');
      expect(protocol.chapi).to.be.an('object');
      expect(protocol.chapi.formats).to.be.an('array');
      expect(protocol.chapi.formats).to.contain('ldp_vc');
      expect(protocol.chapi.description).to.be.a('string');
      expect(protocol.chapi.getRequest).to.be.a('function');
    });
  });

  describe('custom deep link generation', () => {
    it('should generate correct vcapi deep link for qr', () => {
      const protocol = lcwWallet.supportedProtocols.vcapi;
      const exchange = {
        protocols: {
          vcapi: 'https://example.com/exchanges/123'
        }
      };
      const url = protocol.qr.getUrl({exchange});
      expect(url).to.be.a('string');
      expect(url).to.contain('https://lcw.app/request');
      expect(url).to.contain('request=');
      // Verify the request parameter contains JSON with protocols.vcapi
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const requestParam = decodeURIComponent(urlParams.get('request'));
      const requestObject = JSON.parse(requestParam);
      expect(requestObject).to.have.property('protocols');
      expect(requestObject.protocols).to.have.property('vcapi');
      expect(requestObject.protocols.vcapi).to.be('https://example.com/exchanges/123');
    });

    it('should generate correct vcapi deep link for link', () => {
      const protocol = lcwWallet.supportedProtocols.vcapi;
      const exchange = {
        protocols: {
          vcapi: 'https://example.com/exchanges/456'
        }
      };
      const url = protocol.link.getUrl({exchange});
      expect(url).to.be.a('string');
      expect(url).to.contain('https://lcw.app/request');
      expect(url).to.contain('request=');
    });

    it('should return null when vcapi URL not available', () => {
      const protocol = lcwWallet.supportedProtocols.vcapi;
      const exchange = {
        protocols: {}
      };
      const url = protocol.qr.getUrl({exchange});
      expect(url).to.be(null);
    });
  });

  describe('CHAPI request generation', () => {
    it('should generate CHAPI request object', () => {
      const protocol = lcwWallet.supportedProtocols.chapi;
      const exchange = {
        protocols: {
          chapi: 'https://example.com/exchange'
        }
      };
      const request = protocol.chapi.getRequest({exchange});
      expect(request).to.be.an('object');
      expect(request).to.have.property('web');
      expect(request.web).to.have.property('VerifiablePresentation');
      expect(request.web.VerifiablePresentation).to.have.property('query');
      expect(request.web.VerifiablePresentation.query).to.be.an('array');
      expect(
        request.web.VerifiablePresentation.query[0]).to.have.property('type');
      expect(request.web.VerifiablePresentation.query[0].type).to.be(
        'QueryByExample');
    });

    it('should return null when exchange not available', () => {
      const protocol = lcwWallet.supportedProtocols.chapi;
      const request = protocol.chapi.getRequest({exchange: null});
      expect(request).to.be(null);
    });
  });
});
