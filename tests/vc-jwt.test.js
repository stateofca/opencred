import {describe, it} from 'mocha';
import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {verifyUtils} from '../common/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jwtCases = JSON.parse(fs.readFileSync(
  path.join(__dirname, '/fixtures/vc_jwt.json'), 'utf-8'));

describe('VC-JWT', async () => {
  it('should verify valid vc-jwt (did:key)', async () => {
    const verification =
      await verifyUtils.verifyCredentialJWT(jwtCases.valid['did:key']);
    assert.strictEqual(verification.verified, true);
  });

  it('should fail verification of invalid vc-jwt (signature)', async () => {
    const verification =
      await verifyUtils.verifyCredentialJWT(jwtCases.invalid.signature);
    assert.strictEqual(verification.verified, false);
  });

  it('should fail verification of invalid vc-jwt (vc)', async () => {
    const verification =
      await verifyUtils.verifyCredentialJWT(jwtCases.invalid.vc);
    assert.strictEqual(verification.verified, false);
  });

  it.skip('should fail verification of vc-jwt with invalid x5c in did:jwk',
    async () => {
      const verification =
        await verifyUtils.verifyJWTCredential(jwtCases.invalid.vc_x5c);
      console.log(verification.vc.signer)
      assert.strictEqual(verification.verified, false);
    }
  );
});
