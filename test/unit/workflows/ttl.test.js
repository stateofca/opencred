/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  formatExchangeExpires,
  getExchangeTtlRemaining,
  getSecondsUntilExpires,
  refreshExchangeExpiryFields,
  resolveExchangeExpires
} from '../../../lib/workflows/base.js';
import {config} from '@bedrock/core';
import expect from 'expect.js';
import sinon from 'sinon';

describe('getExchangeTtlRemaining', () => {
  it('returns null when exchange lacks expires', () => {
    expect(getExchangeTtlRemaining({exchange: {ttl: 900}})).to.be(null);
    expect(getExchangeTtlRemaining({
      exchange: {ttl: 900, createdAt: new Date()}
    })).to.be(null);
  });

  it('returns null for top-level legacy createdAt/ttl only (expires-only)',
    () => {
      expect(getExchangeTtlRemaining({ttl: 900})).to.be(null);
      expect(getExchangeTtlRemaining({createdAt: null, ttl: 900})).to.be(null);
      expect(getExchangeTtlRemaining({createdAt: new Date()})).to.be(null);
      expect(getExchangeTtlRemaining({
        createdAt: new Date(), ttl: null
      })).to.be(null);
      expect(getExchangeTtlRemaining({
        createdAt: new Date(), ttl: '900'
      })).to.be(null);
      expect(getExchangeTtlRemaining({
        createdAt: new Date(), ttl: NaN
      })).to.be(null);
      expect(getExchangeTtlRemaining({
        createdAt: 'not-a-date', ttl: 900
      })).to.be(null);
    });

  it('returns ttl seconds remaining for valid exchange.expires',
    () => {
      const now = new Date('2026-01-01T12:00:00.000Z');
      const expires = new Date(now.getTime() + 900 * 1000);
      const remaining = getExchangeTtlRemaining({exchange: {expires}, now});
      expect(remaining).to.be(900);
    });

  it('returns 0 when expires is in the past', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const expires = new Date(now.getTime() - 10_000_000);
    expect(getExchangeTtlRemaining({exchange: {expires}, now})).to.be(0);
  });

  it('accepts a Date object for expires', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const expires = new Date(now.getTime() + 60 * 1000);
    const remaining = getExchangeTtlRemaining({exchange: {expires}, now});
    expect(remaining).to.be(60);
  });

  it('accepts an ISO string for expires', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const expiresIso = new Date(now.getTime() + 60 * 1000).toISOString();
    const remaining = getExchangeTtlRemaining({
      exchange: {expires: expiresIso}, now
    });
    expect(remaining).to.be(60);
  });

  it('prefers exchange.expires when createdAt and ttl disagree', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const expires = new Date('2026-01-01T00:05:00.000Z');
    const remaining = getExchangeTtlRemaining({
      exchange: {
        expires,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        ttl: 900
      },
      now
    });
    expect(remaining).to.be(300);
  });
});

describe('resolveExchangeExpires', () => {
  it('returns expires when valid Date', () => {
    const expires = new Date('2026-05-15T12:00:00.000Z');
    const resolved = resolveExchangeExpires({
      exchange: {
        expires,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        ttl: 900
      }
    });
    expect(resolved).to.eql(expires);
  });

  it('returns expires when valid ISO string', () => {
    const expiresIso = '2026-05-15T12:00:00.000Z';
    const resolved = resolveExchangeExpires({
      exchange: {
        expires: expiresIso,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        ttl: 900
      }
    });
    expect(resolved).to.eql(new Date(expiresIso));
  });

  it('returns null when expires is missing', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    expect(resolveExchangeExpires({
      exchange: {createdAt, ttl: 120}
    })).to.be(null);
  });

  it('returns null when expires is invalid despite createdAt and ttl',
    () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      expect(resolveExchangeExpires({
        exchange: {expires: 'not-a-date', createdAt, ttl: 60}
      })).to.be(null);
    });

  it('returns null when exchange has no usable expires', () => {
    expect(resolveExchangeExpires({})).to.be(null);
    expect(resolveExchangeExpires({exchange: {ttl: 900}})).to.be(null);
    expect(resolveExchangeExpires({
      exchange: {createdAt: new Date(), ttl: '900'}
    })).to.be(null);
    expect(resolveExchangeExpires({
      exchange: {createdAt: 'not-a-date', ttl: 900}
    })).to.be(null);
  });
});

describe('getSecondsUntilExpires', () => {
  it('returns null when expires is missing', () => {
    expect(getSecondsUntilExpires({})).to.be(null);
    expect(getSecondsUntilExpires({expires: null})).to.be(null);
  });

  it('returns null when expires is invalid', () => {
    expect(getSecondsUntilExpires({expires: 'not-a-date'})).to.be(null);
  });

  it('returns 0 when expires is in the past', () => {
    const expires = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T01:00:00.000Z');
    expect(getSecondsUntilExpires({expires, now})).to.be(0);
  });

  it('returns correct seconds for a future expires', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const expires = new Date('2026-01-01T00:05:00.000Z');
    expect(getSecondsUntilExpires({expires, now})).to.be(300);
  });

  it('accepts an ISO string for expires', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(getSecondsUntilExpires({
      expires: '2026-01-01T00:01:30.000Z', now
    })).to.be(90);
  });
});

describe('formatExchangeExpires', () => {
  it('formats a valid Date as ISO 8601 with Z', () => {
    const date = new Date('2026-05-15T12:34:56.789Z');
    expect(formatExchangeExpires(date)).to.be('2026-05-15T12:34:56.789Z');
  });

  it('formats a valid ISO string', () => {
    const iso = '2026-05-15T12:34:56.000Z';
    expect(formatExchangeExpires(iso)).to.be(iso);
  });

  it('returns null for invalid input', () => {
    expect(formatExchangeExpires('not-a-date')).to.be(null);
    expect(formatExchangeExpires(undefined)).to.be(null);
  });
});

describe('refreshExchangeExpiryFields', () => {
  let optionsStub;
  let originalOpencred;

  before(() => {
    // Ensure config.opencred exists for stubbing under the unit-test runner
    // (bedrock initialization does not run here).
    originalOpencred = config.opencred;
    if(!config.opencred) {
      config.opencred = {options: {}};
    } else if(!config.opencred.options) {
      config.opencred.options = {};
    }
  });

  after(() => {
    config.opencred = originalOpencred;
  });

  beforeEach(() => {
    optionsStub = sinon.stub(config.opencred, 'options').value({
      ...config.opencred.options,
      exchangeTtlSeconds: 900,
      recordExpiresDurationMs: 24 * 60 * 60 * 1000
    });
  });

  afterEach(() => {
    optionsStub.restore();
  });

  it('uses exchange.ttl when no explicit ttl is passed', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const exchange = {ttl: 120};
    const {expires, recordExpiresAt} = refreshExchangeExpiryFields({
      exchange, now
    });
    expect(expires.getTime()).to.be(now.getTime() + 120 * 1000);
    // recordExpiresDurationMs (1 day) is larger than 120s + 60s grace,
    // so recordExpiresAt is bounded by recordExpiresDurationMs.
    expect(recordExpiresAt.getTime()).to.be(
      now.getTime() + 24 * 60 * 60 * 1000);
  });

  it('uses the explicit ttl over exchange.ttl when both are provided',
    () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      // Make ttl large enough that ttl*1000 + grace exceeds duration so the
      // override is observable.
      optionsStub.restore();
      optionsStub = sinon.stub(config.opencred, 'options').value({
        ...config.opencred.options,
        exchangeTtlSeconds: 900,
        recordExpiresDurationMs: 5000 // 5 seconds
      });
      const {expires, recordExpiresAt} = refreshExchangeExpiryFields({
        exchange: {ttl: 5}, ttl: 16, now
      });
      expect(expires.getTime()).to.be(now.getTime() + 16 * 1000);
      // 16s*1000 + 60s grace = 76000ms beats the 5000ms duration.
      expect(recordExpiresAt.getTime()).to.be(
        now.getTime() + 16 * 1000 + 60_000);
    });

  it('falls back to config.exchangeTtlSeconds when neither exchange ' +
      'nor explicit ttl is provided', () => {
    optionsStub.restore();
    optionsStub = sinon.stub(config.opencred, 'options').value({
      ...config.opencred.options,
      exchangeTtlSeconds: 30,
      recordExpiresDurationMs: 5000 // 5 seconds
    });
    const now = new Date('2026-01-01T00:00:00.000Z');
    const {expires, recordExpiresAt} = refreshExchangeExpiryFields({now});
    expect(expires.getTime()).to.be(now.getTime() + 30 * 1000);
    // 30s*1000 + 60s grace = 90000ms beats the 5000ms duration.
    expect(recordExpiresAt.getTime()).to.be(
      now.getTime() + 30 * 1000 + 60_000);
  });

  it('computes recordExpiresAt as now + max(ttl*1000 + 60s grace, ' +
      'recordExpiresDurationMs)', () => {
    optionsStub.restore();
    optionsStub = sinon.stub(config.opencred, 'options').value({
      ...config.opencred.options,
      exchangeTtlSeconds: 900,
      recordExpiresDurationMs: 5000 // 5 seconds
    });
    const now = new Date('2026-01-01T00:00:00.000Z');
    const {expires, recordExpiresAt} = refreshExchangeExpiryFields({
      exchange: {ttl: 16}, now
    });
    expect(expires.getTime()).to.be(now.getTime() + 16 * 1000);
    // 16s*1000 + 60s grace = 76000ms beats the 5000ms duration.
    expect(recordExpiresAt.getTime()).to.be(
      now.getTime() + 16 * 1000 + 60_000);
  });

  it('returns expires equal to injected now + ttl', () => {
    const now = new Date('2026-05-15T12:34:56.000Z');
    const {expires} = refreshExchangeExpiryFields({
      exchange: {ttl: 60}, now
    });
    expect(expires.getTime()).to.be(now.getTime() + 60 * 1000);
  });

  it('defaults expires to current time + ttl when now is not injected',
    () => {
      const before = Date.now();
      const {expires} = refreshExchangeExpiryFields({exchange: {ttl: 60}});
      const after = Date.now();
      expect(expires).to.be.a(Date);
      expect(expires.getTime()).to.be.greaterThan(before + 60 * 1000 - 1);
      expect(expires.getTime()).to.be.lessThan(after + 60 * 1000 + 1);
    });
});
