/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {canShowOption} from '../../../common/wallets/canShowOption.js';
import expect from 'expect.js';

describe('canShowOption - platform filtering', () => {
  const workflow = {query: [{format: ['mso_mdoc']}]};
  const exchange = {
    protocols: {
      'cadmv-android': 'https://example.com/authz?request_uri=...',
      'cadmv-ios': 'https://example.com/authz?request_uri=...',
      'google-wallet': 'https://example.com/authz?request_uri=...',
      'apple-wallet': 'https://example.com/authz?request_uri=...'
    }
  };
  const availableProtocols = [
    'cadmv-android', 'cadmv-ios', 'google-wallet', 'apple-wallet'
  ];
  const userSettings = {
    enabledWallets: [
      'cadmv-android', 'cadmv-ios', 'google-wallet', 'apple-wallet'
    ],
    enabledProtocols: []
  };

  it('shows android wallets on android platform', () => {
    const platform = {isIOS: false, isAndroid: true, isMobile: true};
    const result = canShowOption({
      workflow, availableProtocols, exchange, platform, userSettings,
      dcApiSystemAvailable: true, walletId: 'cadmv-android'
    });
    expect(result.available).to.be(true);
  });

  it('hides iOS wallets on android platform', () => {
    const platform = {isIOS: false, isAndroid: true, isMobile: true};
    const result = canShowOption({
      workflow, availableProtocols, exchange, platform, userSettings,
      dcApiSystemAvailable: true, walletId: 'cadmv-ios'
    });
    expect(result.available).to.be(false);
  });

  it('hides android wallets on iOS platform', () => {
    const platform = {isIOS: true, isAndroid: false, isMobile: true};
    const result = canShowOption({
      workflow, availableProtocols, exchange, platform, userSettings,
      dcApiSystemAvailable: true, walletId: 'cadmv-android'
    });
    expect(result.available).to.be(false);
  });

  it('shows iOS wallets on iOS platform', () => {
    const platform = {isIOS: true, isAndroid: false, isMobile: true};
    const result = canShowOption({
      workflow, availableProtocols, exchange, platform, userSettings,
      dcApiSystemAvailable: true, walletId: 'cadmv-ios'
    });
    expect(result.available).to.be(true);
  });

  it('shows all wallets on desktop (cross-device)', () => {
    const platform = {isIOS: false, isAndroid: false, isMobile: false};
    const androidResult = canShowOption({
      workflow, availableProtocols, exchange, platform, userSettings,
      dcApiSystemAvailable: true, walletId: 'cadmv-android'
    });
    const iosResult = canShowOption({
      workflow, availableProtocols, exchange, platform, userSettings,
      dcApiSystemAvailable: true, walletId: 'cadmv-ios'
    });
    expect(androidResult.available).to.be(true);
    expect(iosResult.available).to.be(true);
  });
});
