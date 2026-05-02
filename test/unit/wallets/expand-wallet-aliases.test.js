/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {expandWalletAliases} from '../../../common/wallets/index.js';
import expect from 'expect.js';

describe('expandWalletAliases', () => {
  it('expands cadmv-wallet to cadmv-android and cadmv-ios', () => {
    const result = expandWalletAliases(['cadmv-wallet', 'lcw']);
    expect(result).to.contain('cadmv-android');
    expect(result).to.contain('cadmv-ios');
    expect(result).to.contain('lcw');
    expect(result).to.not.contain('cadmv-wallet');
  });

  it('passes through unknown IDs unchanged', () => {
    const result = expandWalletAliases(['google-wallet', 'apple-wallet']);
    expect(result).to.eql(['google-wallet', 'apple-wallet']);
  });

  it('deduplicates results', () => {
    const result = expandWalletAliases(['cadmv-wallet', 'cadmv-android']);
    const androids = result.filter(id => id === 'cadmv-android');
    expect(androids).to.have.length(1);
  });

  it('returns empty array for non-array input', () => {
    expect(expandWalletAliases(null)).to.eql([]);
    expect(expandWalletAliases(undefined)).to.eql([]);
  });
});
