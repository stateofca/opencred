/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Detects Samsung Internet from a User-Agent string. Samsung Internet
 * always includes a `SamsungBrowser/<version>` product token; Chrome on
 * Samsung hardware does not.
 *
 * @param {string} userAgent - The User-Agent string to test.
 * @returns {boolean} True if the User-Agent is Samsung Internet.
 */
export function isSamsungBrowser(userAgent) {
  if(typeof userAgent !== 'string') {
    return false;
  }
  return /SamsungBrowser/i.test(userAgent);
}

/**
 * Classifies a User-Agent string into coarse analytics buckets. Only the
 * buckets are intended for logging — never the raw string, which can be
 * fingerprint-adjacent (device model, exact versions).
 *
 * Detection order matters: Samsung Internet and Edge UAs also contain
 * `Chrome/`, and Chrome UAs also contain `Safari/`.
 *
 * @param {string} userAgent - The User-Agent string to classify.
 * @returns {{browser: string, deviceType: string}} Coarse buckets;
 *   `browser` is one of samsung-internet, edge, firefox, chrome, safari,
 *   other, unknown; `deviceType` is mobile, desktop, or unknown
 *   (wallet HTTP clients like okhttp carry no device markers).
 */
export function classifyUserAgent(userAgent) {
  if(typeof userAgent !== 'string' || userAgent.length === 0) {
    return {browser: 'unknown', deviceType: 'unknown'};
  }

  let browser = 'other';
  if(/SamsungBrowser/i.test(userAgent)) {
    browser = 'samsung-internet';
  } else if(/\bEdgiOS\/|\bEdgA\/|\bEdge?\//.test(userAgent)) {
    browser = 'edge';
  } else if(/\bFirefox\/|\bFxiOS\//.test(userAgent)) {
    browser = 'firefox';
  } else if(/\bChrome\/|\bCriOS\//.test(userAgent)) {
    browser = 'chrome';
  } else if(/\bVersion\/[\d.]+.*\bSafari\//.test(userAgent)) {
    browser = 'safari';
  }

  let deviceType = 'unknown';
  if(/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) {
    deviceType = 'mobile';
  } else if(/Windows NT|Macintosh|X11|CrOS/.test(userAgent)) {
    deviceType = 'desktop';
  }
  return {browser, deviceType};
}
