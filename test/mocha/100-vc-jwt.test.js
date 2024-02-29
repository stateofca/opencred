/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {verifyUtils} from '../../common/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jwtCases = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../fixtures/vc_jwt.json'), 'utf-8'));

describe('VC-JWT', async () => {
  it('should verify valid vc-jwt (did:key)', async () => {
    const verification =
      await verifyUtils.verifyCredentialJWT(jwtCases.valid['did:key']);
    verification.verified.should.be.equal(true);
  });

  it('should fail verification of invalid vc-jwt (signature)', async () => {
    const verification =
      await verifyUtils.verifyCredentialJWT(jwtCases.invalid.signature);
    verification.verified.should.be.equal(false);
  });

  it('should fail verification of invalid vc-jwt (vc)', async () => {
    const verification =
      await verifyUtils.verifyCredentialJWT(jwtCases.invalid.vc);
    verification.verified.should.be.equal(false);
  });
});
