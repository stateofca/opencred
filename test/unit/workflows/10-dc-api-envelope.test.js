/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import sinon from 'sinon';

import {
  buildDcApiRequest,
  DC_API_OID4VP_ACCEPTED_PROTOCOLS,
  DC_API_OID4VP_PROTOCOLS,
  unwrapDcApiOid4vpResponse
} from
  '../../../lib/workflows/common/dc-api-envelope.js';
import {logger} from '../../../lib/logger.js';
import {logUtils} from '../../../common/utils.js';

describe('dc-api-envelope', () => {
  describe('buildDcApiRequest', () => {
    const sampleData = {a: 1};

    it('returns frozen { protocol, data } for each accepted protocol',
      () => {
        for(const protocol of DC_API_OID4VP_ACCEPTED_PROTOCOLS) {
          let result;
          try {
            result = buildDcApiRequest({protocol, data: sampleData});
          } catch(e) {
            throw new Error(
              `buildDcApiRequest threw for protocol "${protocol}": ` +
              e.message);
          }
          expect(result).to.eql(
            {protocol, data: sampleData},
            `unexpected envelope for protocol "${protocol}"`);
          expect(Object.isFrozen(result)).to.be(
            true, `envelope not frozen for protocol "${protocol}"`);
        }
      });

    it('rejects unknown protocol strings', () => {
      expect(() => buildDcApiRequest({
        protocol: 'openid4vp-v99',
        data: {}
      })).to.throwError(e => {
        expect(e.message).to.equal(
          'Unsupported DC API protocol: "openid4vp-v99"'
        );
      });
    });

    it('rejects when data is not a plain object', () => {
      expect(() => buildDcApiRequest({
        protocol: DC_API_OID4VP_PROTOCOLS.v1Signed,
        data: null
      })).to.throwError();
      expect(() => buildDcApiRequest({
        protocol: DC_API_OID4VP_PROTOCOLS.v1Signed,
        data: []
      })).to.throwError();
      expect(() => buildDcApiRequest({
        protocol: DC_API_OID4VP_PROTOCOLS.v1Signed,
        data: 'x'
      })).to.throwError();
      expect(() => buildDcApiRequest({
        protocol: DC_API_OID4VP_PROTOCOLS.v1Signed,
        data: 1
      })).to.throwError();
    });

    it('returned envelope is shallow-frozen at the top level', () => {
      const result = buildDcApiRequest({
        protocol: DC_API_OID4VP_PROTOCOLS.v1Signed,
        data: {nested: true}
      });
      expect(() => {
        result.protocol = 'x';
      }).to.throwError();
    });
  });

  describe('unwrapDcApiOid4vpResponse', () => {
    it('throws when body is null or undefined', () => {
      expect(() => unwrapDcApiOid4vpResponse(null)).to.throwError(e => {
        expect(e.message).to.equal('DC API response body is required');
      });
      expect(() => unwrapDcApiOid4vpResponse(undefined)).to.throwError(
        e => {
          expect(e.message).to.equal('DC API response body is required');
        }
      );
    });

    it('throws for missing protocol', () => {
      expect(() => unwrapDcApiOid4vpResponse({data: {}})).to.throwError();
    });

    it('throws for unknown protocol', () => {
      expect(() => unwrapDcApiOid4vpResponse({
        protocol: 'bad',
        data: {}
      })).to.throwError();
    });

    it('returns protocol, data, and correct isLegacyIdentifier per id',
      () => {
        for(const protocol of DC_API_OID4VP_ACCEPTED_PROTOCOLS) {
          const body = {protocol, data: {vp: protocol}};
          const out = unwrapDcApiOid4vpResponse(body);
          const wantLegacy = protocol === DC_API_OID4VP_PROTOCOLS.legacy;
          expect(out).to.eql(
            {
              protocol,
              data: {vp: protocol},
              isLegacyIdentifier: wantLegacy
            },
            `unexpected unwrap for protocol "${protocol}"`);
        }
      });

    it('result is not frozen', () => {
      const out = unwrapDcApiOid4vpResponse({
        protocol: DC_API_OID4VP_PROTOCOLS.v1Signed,
        data: {}
      });
      expect(Object.isFrozen(out)).to.be(false);
      out.extra = true;
      expect(out.extra).to.be(true);
    });
  });

  describe('logUtils.legacyProtocolIdentifier', () => {
    afterEach(() => {
      sinon.restore();
    });

    it('calls logger.info once with presentation_event payload', () => {
      const infoStub = sinon.stub(logger, 'info');
      logUtils.legacyProtocolIdentifier({
        clientId: 'cid',
        exchangeId: 'xid',
        metadata: {observedProtocol: 'openid4vp', source: 'unit'}
      });
      expect(infoStub.callCount).to.equal(1);
      expect(infoStub.firstCall.args[0]).to.equal('presentation_event');
      expect(infoStub.firstCall.args[1]).to.eql({
        type: 'legacy_protocol_identifier',
        clientId: 'cid',
        exchangeId: 'xid',
        error: undefined,
        metadata: {observedProtocol: 'openid4vp', source: 'unit'}
      });
    });
  });
});
