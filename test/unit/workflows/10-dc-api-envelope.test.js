/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import sinon from 'sinon';

import {
  ANNEX_C_DC_API_PROTOCOL,
  buildAnnexCDcApiRequest,
  buildAnnexDDcApiRequest,
  buildDcApiRequest,
  DC_API_OID4VP_ACCEPTED_PROTOCOLS,
  DC_API_OID4VP_PROTOCOLS,
  normalizeVpTokenMap,
  normalizeVpTokenValue,
  stripFieldsForUnsignedAnnexD,
  UNSIGNED_ANNEX_D_FORBIDDEN_FIELDS,
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

  describe('UNSIGNED_ANNEX_D_FORBIDDEN_FIELDS', () => {
    it('is frozen and lists Annex D unsigned forbidden keys', () => {
      expect(Object.isFrozen(UNSIGNED_ANNEX_D_FORBIDDEN_FIELDS)).to.be(true);
      expect([...UNSIGNED_ANNEX_D_FORBIDDEN_FIELDS]).to.eql([
        'client_id',
        'client_id_scheme',
        'expected_origins'
      ]);
    });
  });

  describe('stripFieldsForUnsignedAnnexD', () => {
    it('removes forbidden fields, keeps others, and does not mutate input',
      () => {
        const input = {
          client_id: 'cid',
          client_id_scheme: 'x',
          expected_origins: ['https://a'],
          response_type: 'vp_token',
          response_mode: 'dc_api'
        };
        const snapshot = {...input};
        const out = stripFieldsForUnsignedAnnexD(input);
        expect(input).to.eql(snapshot, 'input mutated');
        for(const field of UNSIGNED_ANNEX_D_FORBIDDEN_FIELDS) {
          expect(out).not.to.have.key(field);
        }
        expect(out.response_type).to.equal('vp_token');
        expect(out.response_mode).to.equal('dc_api');
      });

    it('throws when input is not a plain object', () => {
      expect(() => stripFieldsForUnsignedAnnexD(null)).to.throwError(e => {
        expect(e.message).to.equal(
          'authorizationRequest must be a plain object');
      });
      expect(() => stripFieldsForUnsignedAnnexD([])).to.throwError();
      expect(() => stripFieldsForUnsignedAnnexD('x')).to.throwError();
    });
  });

  describe('buildAnnexCDcApiRequest', () => {
    it('returns frozen org-iso-mdoc envelope with frozen data', () => {
      const result = buildAnnexCDcApiRequest({
        deviceRequest: 'dr',
        encryptionInfo: 'ei'
      });
      expect(result.protocol).to.equal(ANNEX_C_DC_API_PROTOCOL);
      expect(result.data).to.eql({deviceRequest: 'dr', encryptionInfo: 'ei'});
      expect(Object.isFrozen(result)).to.be(true);
      expect(Object.isFrozen(result.data)).to.be(true);
    });

    it('throws when deviceRequest is missing, empty, or non-string', () => {
      expect(() => buildAnnexCDcApiRequest({
        encryptionInfo: 'ei'
      })).to.throwError(e => {
        expect(e.message).to.equal(
          'buildAnnexCDcApiRequest: deviceRequest must be a non-empty string');
      });
      expect(() => buildAnnexCDcApiRequest({
        deviceRequest: '',
        encryptionInfo: 'ei'
      })).to.throwError(e => {
        expect(e.message).to.equal(
          'buildAnnexCDcApiRequest: deviceRequest must be a non-empty string');
      });
      expect(() => buildAnnexCDcApiRequest({
        deviceRequest: 1,
        encryptionInfo: 'ei'
      })).to.throwError(e => {
        expect(e.message).to.equal(
          'buildAnnexCDcApiRequest: deviceRequest must be a non-empty string');
      });
    });

    it('throws when encryptionInfo is missing, empty, or non-string', () => {
      expect(() => buildAnnexCDcApiRequest({
        deviceRequest: 'dr'
      })).to.throwError(e => {
        expect(e.message).to.equal(
          'buildAnnexCDcApiRequest: encryptionInfo must be a non-empty string');
      });
      expect(() => buildAnnexCDcApiRequest({
        deviceRequest: 'dr',
        encryptionInfo: ''
      })).to.throwError(e => {
        expect(e.message).to.equal(
          'buildAnnexCDcApiRequest: encryptionInfo must be a non-empty string');
      });
      expect(() => buildAnnexCDcApiRequest({
        deviceRequest: 'dr',
        encryptionInfo: null
      })).to.throwError(e => {
        expect(e.message).to.equal(
          'buildAnnexCDcApiRequest: encryptionInfo must be a non-empty string');
      });
    });
  });

  describe('buildAnnexDDcApiRequest', () => {
    it('signed=true returns frozen v1Signed envelope with { request: jwt }',
      () => {
        const jwt = 'header.payload.sig';
        const result = buildAnnexDDcApiRequest({
          signed: true,
          signedJwt: jwt
        });
        expect(result).to.eql({
          protocol: DC_API_OID4VP_PROTOCOLS.v1Signed,
          data: {request: jwt}
        });
        expect(Object.isFrozen(result)).to.be(true);
      });

    it('signed=false returns frozen v1Unsigned envelope and strips fields',
      () => {
        const result = buildAnnexDDcApiRequest({
          signed: false,
          authorizationRequest: {
            client_id: 'x',
            client_id_scheme: 'y',
            expected_origins: ['z'],
            nonce: 'n1'
          }
        });
        expect(result.protocol).to.equal(
          DC_API_OID4VP_PROTOCOLS.v1Unsigned,
          'protocol');
        expect(Object.isFrozen(result)).to.be(true);
        expect(result.data).to.eql({nonce: 'n1'});
        for(const field of UNSIGNED_ANNEX_D_FORBIDDEN_FIELDS) {
          expect(result.data).not.to.have.key(field);
        }
      });

    it('rejects non-boolean signed', () => {
      expect(() => buildAnnexDDcApiRequest({
        signed: 1,
        signedJwt: 'x'
      })).to.throwError(e => {
        expect(e.message).to.equal(
          'buildAnnexDDcApiRequest: signed must be a boolean');
      });
    });

    it('rejects signed=true without string signedJwt', () => {
      expect(() => buildAnnexDDcApiRequest({
        signed: true
      })).to.throwError(e => {
        expect(e.message).to.equal(
          'buildAnnexDDcApiRequest: signedJwt is required when signed=true');
      });
      expect(() => buildAnnexDDcApiRequest({
        signed: true,
        signedJwt: 1
      })).to.throwError(e => {
        expect(e.message).to.equal(
          'buildAnnexDDcApiRequest: signedJwt is required when signed=true');
      });
    });

    it('rejects signed=false without plain authorizationRequest', () => {
      expect(() => buildAnnexDDcApiRequest({signed: false})).to.throwError(
        e => {
          expect(e.message).to.equal(
            'buildAnnexDDcApiRequest: authorizationRequest must be a plain ' +
            'object when signed=false');
        });
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

    it('returns protocol, data, and correct isLegacyProtocol per id',
      () => {
        for(const protocol of DC_API_OID4VP_ACCEPTED_PROTOCOLS) {
          const body = {protocol, data: {vp: protocol}};
          const out = unwrapDcApiOid4vpResponse(body);
          const wantLegacy = protocol === DC_API_OID4VP_PROTOCOLS.legacy;
          expect(out).to.eql(
            {
              protocol,
              data: {vp: protocol},
              isLegacyProtocol: wantLegacy
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

  describe('normalizeVpTokenValue', () => {
    it('returns string values unchanged', () => {
      expect(normalizeVpTokenValue('abc123')).to.equal('abc123');
    });

    it('extracts first element from array values', () => {
      expect(normalizeVpTokenValue(['abc123', 'def456'])).to.equal('abc123');
    });

    it('throws on empty arrays', () => {
      expect(() => normalizeVpTokenValue([]))
        .to.throwError(/empty/);
    });
  });

  describe('normalizeVpTokenMap', () => {
    it('passes through string map values unchanged', () => {
      const input = {0: 'abc'};
      expect(normalizeVpTokenMap(input)).to.eql({0: 'abc'});
      expect(input).to.eql({0: 'abc'}, 'input must not be mutated');
    });

    it('unwraps single-element arrays', () => {
      expect(normalizeVpTokenMap({0: ['abc']})).to.eql({0: 'abc'});
    });

    it('uses first element for multi-element arrays', () => {
      expect(normalizeVpTokenMap({0: ['a', 'b']})).to.eql({0: 'a'});
    });

    it('throws on empty arrays with credential id in message', () => {
      expect(() => normalizeVpTokenMap({0: []}))
        .to.throwError(/credential ID "0"/);
    });

    it('returns null and undefined unchanged', () => {
      expect(normalizeVpTokenMap(null)).to.be(null);
      expect(normalizeVpTokenMap(undefined)).to.be(undefined);
    });

    it('normalizes mixed string and array values, w/first element', () => {
      expect(normalizeVpTokenMap({
        a: 'x',
        b: ['y'],
        c: ['u', 'v']
      })).to.eql({a: 'x', b: 'y', c: 'u'});
    });

    it('returns arrays unchanged (not a credential-id map)', () => {
      const arr = ['only'];
      expect(normalizeVpTokenMap(arr)).to.be(arr);
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
