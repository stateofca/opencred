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

// Major-version token per `classifyUserAgent` browser bucket. Safari carries
// its version in `Version/`, not `Safari/`, which is the WebKit build.
const BROWSER_VERSION_PATTERNS = {
  'samsung-internet': /SamsungBrowser\/(\d+)/i,
  edge: /\b(?:EdgiOS|EdgA|Edge?)\/(\d+)/,
  firefox: /\b(?:Firefox|FxiOS)\/(\d+)/,
  chrome: /\b(?:Chrome|CriOS)\/(\d+)/,
  safari: /\bVersion\/(\d+)/
};

/**
 * Classifies a User-Agent string into an OS bucket and the browser's major
 * version. Kept separate from `classifyUserAgent` so the extra detail lands
 * only on the DC API outcome events that need it, where platform behavior
 * varies by OS and browser release. The result is still bucketed; it never
 * includes the device model or the full version string.
 *
 * An iPad in desktop mode reports a Macintosh UA, so it classifies as `macos`.
 *
 * @param {string} userAgent - The User-Agent string to classify.
 * @returns {{os: string, browserMajorVersion?: number}} The buckets. The
 *   `os` value is one of android, ios, chromeos, windows, macos, linux,
 *   other, unknown; `browserMajorVersion` is present only for a recognized
 *   browser.
 */
export function classifyUserAgentDetail(userAgent) {
  if(typeof userAgent !== 'string' || userAgent.length === 0) {
    return {os: 'unknown'};
  }

  // Android UAs also contain `Linux`, and ChromeOS UAs contain `X11`.
  let os = 'other';
  if(/Android/i.test(userAgent)) {
    os = 'android';
  } else if(/iPhone|iPad|iPod/.test(userAgent)) {
    os = 'ios';
  } else if(/\bCrOS\b/.test(userAgent)) {
    os = 'chromeos';
  } else if(/Windows NT/.test(userAgent)) {
    os = 'windows';
  } else if(/Macintosh|Mac OS X/.test(userAgent)) {
    os = 'macos';
  } else if(/Linux|X11/.test(userAgent)) {
    os = 'linux';
  }

  const {browser} = classifyUserAgent(userAgent);
  const match = BROWSER_VERSION_PATTERNS[browser]?.exec(userAgent);
  return {
    os,
    ...(match && {browserMajorVersion: Number.parseInt(match[1], 10)})
  };
}
