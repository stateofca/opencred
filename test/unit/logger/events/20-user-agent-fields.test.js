/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {logger} from '../../../../lib/logger.js';
import {logUtils} from '../../../../lib/logger/events/index.js';

const SAMSUNG_INTERNET_UA =
  'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';

describe('logUtils user agent fields', () => {
  let originalInfo;
  let logged;

  beforeEach(() => {
    logged = [];
    originalInfo = logger.info;
    logger.info = (logName, event) => logged.push({logName, event});
  });

  afterEach(() => {
    logger.info = originalInfo;
  });

  it('presentationError includes browser and deviceType', () => {
    logUtils.presentationError('c1', 'e1', 'bang', SAMSUNG_INTERNET_UA);
    expect(logged.length).to.be(1);
    expect(logged[0].event.type).to.be('presentation_error');
    expect(logged[0].event.browser).to.be('samsung-internet');
    expect(logged[0].event.deviceType).to.be('mobile');
  });

  it('presentationStart includes browser and deviceType', () => {
    logUtils.presentationStart('c1', 'e1', 'OID4VP-1.0', SAMSUNG_INTERNET_UA);
    expect(logged[0].event.type).to.be('presentation_start');
    expect(logged[0].event.profile).to.be('OID4VP-1.0');
    expect(logged[0].event.browser).to.be('samsung-internet');
    expect(logged[0].event.deviceType).to.be('mobile');
  });

  it('presentationSuccess includes browser and deviceType', () => {
    logUtils.presentationSuccess('c1', 'e1', SAMSUNG_INTERNET_UA);
    expect(logged[0].event.type).to.be('presentation_success');
    expect(logged[0].event.browser).to.be('samsung-internet');
    expect(logged[0].event.deviceType).to.be('mobile');
  });

  it('callbackSuccess includes browser and deviceType', () => {
    logUtils.callbackSuccess('c1', 'e1', SAMSUNG_INTERNET_UA);
    expect(logged[0].event.type).to.be('callback_success');
    expect(logged[0].event.browser).to.be('samsung-internet');
    expect(logged[0].event.deviceType).to.be('mobile');
  });

  it('reports unknown when no user agent is provided', () => {
    logUtils.presentationError('c1', 'e1', 'bang');
    expect(logged[0].event.browser).to.be('unknown');
    expect(logged[0].event.deviceType).to.be('unknown');
  });

  it('does not log the raw user agent string', () => {
    logUtils.presentationError('c1', 'e1', 'bang', SAMSUNG_INTERNET_UA);
    expect(JSON.stringify(logged[0].event)).to.not.contain('SM-S918B');
  });
});
