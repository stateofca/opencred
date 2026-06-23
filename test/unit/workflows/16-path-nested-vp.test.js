/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {JSONPath} from 'jsonpath-plus';
import expect from 'expect.js';

// Mirrors the production vcQuery built from `presentation_submission`
// `path_nested.path` in verifyOID4VPSubmission / verifyDraft18Submission
// (lib/workflows/common/oid4vp-shared.js). Wallets conventionally root the
// jwt_vp_json path_nested at the decoded VP-JWT (`$.vp.verifiableCredential`).
const vcQuery = vp =>
  JSONPath({path: '$.vp.verifiableCredential[0]', json: vp})[0];

describe('jwt_vp_json path_nested rooted at $.vp', () => {
  // unenvelopeJwtVp() strips the `.vp` wrapper, leaving the inner presentation
  // object directly (no `.vp`), which is what verifyJwtSubmission applies
  // vcQuery to first.
  const unwrappedVp = {verifiableCredential: ['vc-jwt-string']};

  it('a $.vp-rooted path does not resolve against the unwrapped VP', () => {
    // Without the `{vp}` fallback this yields "VC not found in presentation".
    expect(vcQuery(unwrappedVp)).to.be(undefined);
  });

  it('resolves once the VP is re-wrapped as {vp} (the fix)', () => {
    expect(vcQuery({vp: unwrappedVp})).to.be('vc-jwt-string');
  });
});
