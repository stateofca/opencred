/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {normalizeVpTokenJwt, verifyUtils} from '../../common/utils.js';
import expect from 'expect.js';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jwtCases = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../fixtures/vc_jwt.json'), 'utf-8'));

describe('VC-JWT', async () => {
  it('should verify valid vc-jwt (did:key)', async () => {
    const verification =
      await verifyUtils.verifyCredentialJWT(jwtCases.valid['did:key'], {
        skewTime: new Date('2025-12-01T00:00:00Z').getTime()
      });
    verification.verified.should.be.equal(true);
  });

  it('should fail verification of invalid vc-jwt (signature)', async () => {
    const verification =
      await verifyUtils.verifyCredentialJWT(jwtCases.invalid.signature, {
        skewTime: new Date('2025-12-01T00:00:00Z').getTime()
      });
    verification.verified.should.be.equal(false);
  });

  it('should fail verification of invalid vc-jwt (vc)', async () => {
    const verification =
      await verifyUtils.verifyCredentialJWT(jwtCases.invalid.vc, {
        skewTime: new Date('2025-12-01T00:00:00Z').getTime()
      });
    verification.verified.should.be.equal(false);
  });
  it('should fail verification of invalid vc-jwt vp (nonce)', async () => {
    const verification =
      await verifyUtils.verifyPresentationJWT(jwtCases.valid['did:key'], {
        challenge: `incorrect`,
        skewTime: new Date('2025-12-01T00:00:00Z').getTime()
      });
    verification.verified.should.be.equal(false);
    verification.errors[0].should.contain(
      'Presentation does not contain the mandatory challenge (JWT: nonce)');
  });

  describe('normalizeVpTokenJwt', () => {
    const plainJwt = jwtCases.valid['did:key'];
    const jsonStringifiedJwt = JSON.stringify(plainJwt);

    it('should return plain JWT string as-is', () => {
      const result = normalizeVpTokenJwt(plainJwt);
      result.should.be.equal(plainJwt);
      result.should.be.a('string');
    });

    it('should unwrap JSON-stringified JWT string', () => {
      const result = normalizeVpTokenJwt(jsonStringifiedJwt);
      result.should.be.equal(plainJwt);
      result.should.be.a('string');
      // Verify it's not double-wrapped
      expect(result.startsWith('"')).to.be.false;
      expect(result.endsWith('"')).to.be.false;
    });

    it('should handle non-string input by returning as-is', () => {
      const obj = {token: plainJwt};
      const result = normalizeVpTokenJwt(obj);
      result.should.be.equal(obj);
    });

    it('should handle string that starts/ends with quotes/not valid JSON',
      () => {
        const invalidJson = '"not.valid.jwt';
        const result = normalizeVpTokenJwt(invalidJson);
        result.should.be.equal(invalidJson);
      });

    it('should handle string that is valid JSON but parses to non-string',
      () => {
        const jsonObject = JSON.stringify({token: plainJwt});
        const result = normalizeVpTokenJwt(jsonObject);
        // Should return original since parsed result is not a string
        result.should.be.equal(jsonObject);
      });

    it('should handle empty string', () => {
      const result = normalizeVpTokenJwt('');
      result.should.be.equal('');
    });

    it('should handle JSON-stringified empty string', () => {
      const jsonEmpty = JSON.stringify('');
      const result = normalizeVpTokenJwt(jsonEmpty);
      result.should.be.equal('');
    });
  });
});
