/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  resolveDeviceContextName,
  resolveProductName
} from '../../../common/wallets/index.js';
import expect from 'expect.js';

// A stub translate function: returns the mapped string for known keys, and
// echoes the key back for unknown ones (matching vue-i18n's missing-key
// behaviour, which the resolvers treat as "no translation").
const makeT = map => key => (key in map ? map[key] : key);

describe('resolveDeviceContextName', () => {
  it('prefers the translation key when it resolves', () => {
    const wallet = {nameKey: 'wallet_x_name', name: 'Literal Name'};
    const t = makeT({wallet_x_name: 'Translated Name'});
    expect(resolveDeviceContextName({wallet, t})).to.be('Translated Name');
  });

  it('falls back to the literal name when the key is missing', () => {
    const wallet = {nameKey: 'wallet_x_name', name: 'Literal Name'};
    const t = makeT({});
    expect(resolveDeviceContextName({wallet, t})).to.be('Literal Name');
  });

  it('falls back to the literal name when no t is given', () => {
    const wallet = {nameKey: 'wallet_x_name', name: 'Literal Name'};
    expect(resolveDeviceContextName({wallet})).to.be('Literal Name');
  });

  it('falls back to the id when neither key nor name resolve', () => {
    expect(resolveDeviceContextName({wallet: {}, fallbackId: 'wid'}))
      .to.be('wid');
  });
});

describe('resolveProductName', () => {
  it('prefers the product-name key when it resolves', () => {
    const wallet = {
      productNameKey: 'wallet_x_product', productName: 'Product Literal',
      name: 'Device Name'
    };
    const t = makeT({wallet_x_product: 'Product Translated'});
    expect(resolveProductName({wallet, t})).to.be('Product Translated');
  });

  it('falls back to the literal product name when its key is missing', () => {
    const wallet = {
      productNameKey: 'wallet_x_product', productName: 'Product Literal',
      name: 'Device Name'
    };
    expect(resolveProductName({wallet, t: makeT({})}))
      .to.be('Product Literal');
  });

  it('falls back to the device-context name when product name is unset', () => {
    const wallet = {name: 'Device Name'};
    expect(resolveProductName({wallet})).to.be('Device Name');
  });

  it('falls back through to the device-context key when product is unset',
    () => {
      const wallet = {nameKey: 'wallet_x_name'};
      const t = makeT({wallet_x_name: 'Device Translated'});
      expect(resolveProductName({wallet, t})).to.be('Device Translated');
    });

  it('falls back to the id when nothing else resolves', () => {
    expect(resolveProductName({wallet: {}, fallbackId: 'wid'})).to.be('wid');
  });

  it('the two-platform product shares one product name across platforms',
    () => {
      const android = {name: 'CA DMV Wallet on Android',
        productName: 'CA DMV Wallet'};
      const ios = {name: 'CA DMV Wallet on iOS',
        productName: 'CA DMV Wallet'};
      // Device-context names differ per platform...
      expect(resolveDeviceContextName({wallet: android}))
        .to.be('CA DMV Wallet on Android');
      expect(resolveDeviceContextName({wallet: ios}))
        .to.be('CA DMV Wallet on iOS');
      // ...while the product name is shared.
      expect(resolveProductName({wallet: android})).to.be('CA DMV Wallet');
      expect(resolveProductName({wallet: ios})).to.be('CA DMV Wallet');
    });
});
