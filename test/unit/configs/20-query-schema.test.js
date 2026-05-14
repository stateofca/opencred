/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {OpenCredQuerySchema} from '../../../configs/config-utils.js';

describe('OpenCredQuerySchema', () => {
  it('should accept query with type and context', () => {
    const result = OpenCredQuerySchema.safeParse([{
      type: ['VerifiableCredential'],
      context: ['https://www.w3.org/ns/credentials/v2'],
      format: ['ldp_vc']
    }]);
    expect(result.success).to.be(true);
  });

  it('should accept query with context only', () => {
    const result = OpenCredQuerySchema.safeParse([{
      context: ['https://www.w3.org/ns/credentials/v2'],
      format: ['ldp_vc']
    }]);
    expect(result.success).to.be(true);
  });

  it('should accept query with neither type nor context', () => {
    const result = OpenCredQuerySchema.safeParse([{
      format: ['mso_mdoc']
    }]);
    expect(result.success).to.be(true);
  });

  it('should reject query with type but no context', () => {
    const result = OpenCredQuerySchema.safeParse([{
      type: ['VerifiableCredential'],
      format: ['ldp_vc']
    }]);
    expect(result.success).to.be(false);
    expect(result.error.issues[0].message).to.contain(
      'must also include "context"'
    );
  });

  it('should reject query item with type and empty context array', () => {
    const result = OpenCredQuerySchema.safeParse([{
      type: ['VerifiableCredential'],
      context: [],
      format: ['ldp_vc']
    }]);
    expect(result.success).to.be(false);
    expect(result.error.issues[0].message).to.contain(
      'must also include "context"'
    );
  });

  it('should accept multiple items when all valid', () => {
    const result = OpenCredQuerySchema.safeParse([
      {
        type: ['VerifiableCredential'],
        context: ['https://www.w3.org/ns/credentials/v2'],
        format: ['ldp_vc']
      },
      {
        fields: {'org.iso.18013.5.1': ['family_name']},
        format: ['mso_mdoc']
      }
    ]);
    expect(result.success).to.be(true);
  });

  it('should reject when any item has type without context', () => {
    const result = OpenCredQuerySchema.safeParse([
      {
        type: ['VerifiableCredential'],
        context: ['https://www.w3.org/ns/credentials/v2'],
        format: ['ldp_vc']
      },
      {
        type: ['OpenBadgeCredential'],
        format: ['ldp_vc']
      }
    ]);
    expect(result.success).to.be(false);
    expect(result.error.issues[0].message).to.contain(
      'must also include "context"'
    );
  });
});
