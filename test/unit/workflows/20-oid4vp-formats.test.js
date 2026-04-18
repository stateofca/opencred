/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {
  msoMdocFormatLegacy,
  msoMdocFormatOid4vp10,
  sdJwtVcFormatOid4vp10
} from '../../../lib/workflows/common/oid4vp-formats.js';

describe('oid4vp-formats', () => {
  describe('msoMdocFormatOid4vp10', () => {
    it('returns frozen object with OID4VP 1.0 shape and no legacy alg',
      () => {
        const fmt = msoMdocFormatOid4vp10();
        expect(Object.isFrozen(fmt)).to.be(true);
        expect(fmt.issuerauth_alg_values).to.eql([-7]);
        expect(fmt.deviceauth_alg_values).to.eql([-7]);
        expect(fmt).to.not.have.key('alg');
      });
  });

  describe('msoMdocFormatLegacy', () => {
    it('returns frozen legacy shape without issuerauth_alg_values', () => {
      const fmt = msoMdocFormatLegacy();
      expect(Object.isFrozen(fmt)).to.be(true);
      expect(fmt.alg).to.eql(['ES256']);
      expect(fmt).to.not.have.key('issuerauth_alg_values');
    });
  });

  describe('sdJwtVcFormatOid4vp10', () => {
    // Document expected values that may be used for future SD-JWT processing.
    it('returns frozen object with sd-jwt and kb-jwt algorithm fields',
      () => {
        const fmt = sdJwtVcFormatOid4vp10();
        expect(Object.isFrozen(fmt)).to.be(true);
        expect(fmt['sd-jwt_alg_values']).to.eql(['ES256']);
        expect(fmt['kb-jwt_alg_values']).to.eql(['ES256']);
      });
  });
});
