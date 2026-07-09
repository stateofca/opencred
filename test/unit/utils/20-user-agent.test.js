/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  classifyUserAgent,
  isSamsungBrowser
} from '../../../common/userAgent.js';
import expect from 'expect.js';

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

const CHROME_WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/125.0.0.0 Safari/537.36';

const SAFARI_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'Version/17.5 Safari/605.1.15';

const FIREFOX_WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) ' +
  'Gecko/20100101 Firefox/126.0';

const EDGE_WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0';

const WALLET_HTTP_CLIENT_UA = 'okhttp/4.12.0';

describe('classifyUserAgent', () => {
  it('should classify Samsung Internet as mobile', () => {
    expect(classifyUserAgent(SAMSUNG_INTERNET_UA)).to.eql(
      {browser: 'samsung-internet', deviceType: 'mobile'});
  });

  it('should classify a Samsung tablet as mobile despite no Mobile token',
    () => {
      expect(classifyUserAgent(SAMSUNG_TABLET_UA)).to.eql(
        {browser: 'samsung-internet', deviceType: 'mobile'});
    });

  it('should classify Chrome on Android as mobile', () => {
    expect(classifyUserAgent(CHROME_ANDROID_UA)).to.eql(
      {browser: 'chrome', deviceType: 'mobile'});
  });

  it('should classify Chrome on Windows as desktop', () => {
    expect(classifyUserAgent(CHROME_WINDOWS_UA)).to.eql(
      {browser: 'chrome', deviceType: 'desktop'});
  });

  it('should classify Safari on iOS as mobile', () => {
    expect(classifyUserAgent(SAFARI_IOS_UA)).to.eql(
      {browser: 'safari', deviceType: 'mobile'});
  });

  it('should classify Safari on macOS as desktop', () => {
    expect(classifyUserAgent(SAFARI_MAC_UA)).to.eql(
      {browser: 'safari', deviceType: 'desktop'});
  });

  it('should classify Firefox on Windows as desktop', () => {
    expect(classifyUserAgent(FIREFOX_WINDOWS_UA)).to.eql(
      {browser: 'firefox', deviceType: 'desktop'});
  });

  it('should classify Edge on Windows as desktop, not chrome', () => {
    expect(classifyUserAgent(EDGE_WINDOWS_UA)).to.eql(
      {browser: 'edge', deviceType: 'desktop'});
  });

  it('should classify a wallet HTTP client as other/unknown', () => {
    expect(classifyUserAgent(WALLET_HTTP_CLIENT_UA)).to.eql(
      {browser: 'other', deviceType: 'unknown'});
  });

  it('should classify missing input as unknown/unknown', () => {
    expect(classifyUserAgent(undefined)).to.eql(
      {browser: 'unknown', deviceType: 'unknown'});
    expect(classifyUserAgent('')).to.eql(
      {browser: 'unknown', deviceType: 'unknown'});
  });
});
