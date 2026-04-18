/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {buildClientMetadata} from
  '../../../lib/workflows/common/client-metadata.js';

describe('client-metadata', () => {
  describe('buildClientMetadata', () => {
    it('Annex D: OID4VP 1.0 mso_mdoc, no vp_formats, no enc values', () => {
      const md = buildClientMetadata({profile: '18013-7-Annex-D'});
      expect(Object.isFrozen(md)).to.be(true);
      expect(md.vp_formats_supported.mso_mdoc.issuerauth_alg_values).to.eql(
        [-7]);
      expect(md.vp_formats_supported.mso_mdoc.deviceauth_alg_values).to.eql(
        [-7]);
      expect(md).to.not.have.key('vp_formats');
      expect(md).to.not.have.key('encrypted_response_enc_values_supported');
    });

    it('Annex C: parallel vp_formats_supported shape to Annex D', () => {
      const md = buildClientMetadata({profile: '18013-7-Annex-C'});
      expect(Object.isFrozen(md)).to.be(true);
      expect(md.vp_formats_supported.mso_mdoc.issuerauth_alg_values).to.eql(
        [-7]);
      expect(md).to.not.have.key('vp_formats');
      expect(md).to.not.have.key('encrypted_response_enc_values_supported');
    });

    it('HAIP: OID4VP mso_mdoc, enc algs, jwks from single JWK', () => {
      const jwk = {kty: 'EC', crv: 'P-256', x: 'abc', y: 'def'};
      const md = buildClientMetadata({
        profile: 'OID4VP-HAIP-1.0',
        encryptionJwks: jwk
      });
      expect(Object.isFrozen(md)).to.be(true);
      expect(md.vp_formats_supported.mso_mdoc.issuerauth_alg_values).to.eql(
        [-7]);
      expect(md.vp_formats_supported.mso_mdoc.deviceauth_alg_values).to.eql(
        [-7]);
      expect(md.jwks.keys).to.eql([jwk]);
      expect(md.encrypted_response_enc_values_supported).to.contain(
        'A128GCM');
      expect(md.encrypted_response_enc_values_supported).to.contain(
        'A256GCM');
      expect(md).to.not.have.key('vp_formats');
    });

    it('HAIP: jwks uses existing keys array when encryptionJwks is JWKS',
      () => {
        const k1 = {kty: 'EC', crv: 'P-256', kid: 'a'};
        const k2 = {kty: 'EC', crv: 'P-256', kid: 'b'};
        const md = buildClientMetadata({
          profile: 'OID4VP-HAIP-1.0',
          encryptionJwks: {keys: [k1, k2]}
        });
        expect(md.jwks.keys).to.eql([k1, k2]);
      });

    it('HAIP: omits jwks when encryptionJwks not supplied', () => {
      const md = buildClientMetadata({profile: 'OID4VP-HAIP-1.0'});
      expect(md).to.not.have.key('jwks');
    });

    it('standard: legacy vp_formats.mso_mdoc.alg ES256', () => {
      const md = buildClientMetadata({profile: 'OID4VP-combined'});
      expect(Object.isFrozen(md)).to.be(true);
      expect(md.vp_formats.mso_mdoc.alg).to.eql(['ES256']);
      expect(md.vp_formats.mso_mdoc).to.not.have.key(
        'issuerauth_alg_values');
      expect(md).to.not.have.key('vp_formats_supported');
    });

    it('unknown profile falls back to standard legacy shape', () => {
      const md = buildClientMetadata({profile: 'unknown-profile-xyz'});
      expect(md.vp_formats.mso_mdoc.alg).to.eql(['ES256']);
      expect(md).to.not.have.key('vp_formats_supported');
    });

    it('sets client_name when clientName is a string', () => {
      const md = buildClientMetadata({
        profile: '18013-7-Annex-D',
        clientName: 'Test Verifier'
      });
      expect(md.client_name).to.equal('Test Verifier');
    });
  });
});
