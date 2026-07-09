/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {isSamsungBrowser} from '../../../common/userAgent.js';

const SAMSUNG_INTERNET_UA =
  'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';

const SAMSUNG_TABLET_UA =
  'Mozilla/5.0 (Linux; Android 12; SAMSUNG SM-X700) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'SamsungBrowser/19.0 Chrome/102.0.5005.125 Safari/537.36';

const CHROME_ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/125.0.0.0 Mobile Safari/537.36';

const SAFARI_IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'Version/17.5 Mobile/15E148 Safari/604.1';

describe('isSamsungBrowser', () => {
  it('should detect Samsung Internet', () => {
    expect(isSamsungBrowser(SAMSUNG_INTERNET_UA)).to.be(true);
  });

  it('should detect Samsung Internet on a tablet (no Mobile token)', () => {
    expect(isSamsungBrowser(SAMSUNG_TABLET_UA)).to.be(true);
  });

  it('should not detect Chrome on a Samsung device', () => {
    // Chrome on Samsung hardware has no SamsungBrowser token
    expect(isSamsungBrowser(CHROME_ANDROID_UA)).to.be(false);
  });

  it('should not detect Safari on iOS', () => {
    expect(isSamsungBrowser(SAFARI_IOS_UA)).to.be(false);
  });

  it('should handle missing or non-string input', () => {
    expect(isSamsungBrowser(undefined)).to.be(false);
    expect(isSamsungBrowser(null)).to.be(false);
    expect(isSamsungBrowser('')).to.be(false);
    expect(isSamsungBrowser(42)).to.be(false);
  });
});
