/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {logger} from '../../../../lib/logger.js';
import {logUtils} from '../../../../lib/logger/events/index.js';
import {presentationDcApiCancelled} from
  '../../../../lib/logger/events/presentationDcApiCancelled.js';
import {presentationDcApiError} from
  '../../../../lib/logger/events/presentationDcApiError.js';
import {presentationDcApiFlowError} from
  '../../../../lib/logger/events/presentationDcApiFlowError.js';
import {presentationDcApiTimeout} from
  '../../../../lib/logger/events/presentationDcApiTimeout.js';

describe('logger/events DC API builders', () => {
  it('presentationDcApiCancelled builds expected payload', () => {
    const {logName, event} = presentationDcApiCancelled({
      clientId: 'c1',
      exchangeId: 'e1',
      profile: 'OID4VP-1.0'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_dc_api_cancelled',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined,
      profile: 'OID4VP-1.0'
    });
  });

  it('presentationDcApiCancelled defaults missing identifiers to unknown',
    () => {
      const {event} = presentationDcApiCancelled({});
      expect(event.clientId).to.equal('unknown');
      expect(event.exchangeId).to.equal('unknown');
    });

  it('presentationDcApiCancelled omits profile when absent', () => {
    const {event} = presentationDcApiCancelled({
      clientId: 'c1',
      exchangeId: 'e1'
    });
    expect(event).not.to.have.key('profile');
  });

  it('presentationDcApiError builds expected payload', () => {
    const {logName, event} = presentationDcApiError({
      clientId: 'c1',
      exchangeId: 'e1',
      profile: 'OID4VP-1.0',
      errorName: 'AbortError'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_dc_api_error',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined,
      profile: 'OID4VP-1.0',
      errorName: 'AbortError'
    });
  });

  it('presentationDcApiError defaults missing identifiers to unknown', () => {
    const {event} = presentationDcApiError({});
    expect(event.clientId).to.equal('unknown');
    expect(event.exchangeId).to.equal('unknown');
  });

  it('presentationDcApiError omits profile and errorName when absent', () => {
    const {event} = presentationDcApiError({
      clientId: 'c1',
      exchangeId: 'e1'
    });
    expect(event).not.to.have.key('profile');
    expect(event).not.to.have.key('errorName');
  });

  it('presentationDcApiError includes dcApiErrorReason when provided', () => {
    const {event} = presentationDcApiError({
      clientId: 'c1',
      exchangeId: 'e1',
      dcApiErrorReason: 'no-provider'
    });
    expect(event.dcApiErrorReason).to.equal('no-provider');
  });

  it('presentationDcApiError omits dcApiErrorReason when absent', () => {
    const {event} = presentationDcApiError({
      clientId: 'c1',
      exchangeId: 'e1'
    });
    expect(event).not.to.have.key('dcApiErrorReason');
  });

  it('presentationDcApiError never logs a raw errorMessage', () => {
    const {event} = presentationDcApiError({
      clientId: 'c1',
      exchangeId: 'e1',
      errorMessage: 'raw wallet-implementation text',
      dcApiErrorReason: 'transport'
    });
    expect(event).not.to.have.key('errorMessage');
    expect(event.dcApiErrorReason).to.equal('transport');
  });

  it('presentationDcApiTimeout builds expected payload', () => {
    const {logName, event} = presentationDcApiTimeout({
      clientId: 'c1',
      exchangeId: 'e1',
      profile: 'OID4VP-1.0',
      timeoutMs: 30000
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_dc_api_timeout',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined,
      profile: 'OID4VP-1.0',
      timeoutMs: 30000
    });
  });

  it('presentationDcApiTimeout defaults missing identifiers to unknown',
    () => {
      const {event} = presentationDcApiTimeout({});
      expect(event.clientId).to.equal('unknown');
      expect(event.exchangeId).to.equal('unknown');
    });

  it('presentationDcApiTimeout omits profile and timeoutMs when absent',
    () => {
      const {event} = presentationDcApiTimeout({
        clientId: 'c1',
        exchangeId: 'e1'
      });
      expect(event).not.to.have.key('profile');
      expect(event).not.to.have.key('timeoutMs');
    });

  // `outcome` is the already-sanitized field set from `sanitizeDcApiOutcome`;
  // each DC API builder spreads it into the event unchanged.
  const outcome = {
    elapsedMs: 42,
    errorCode: 19,
    errorMessageHash: '0123456789abcdef',
    os: 'android',
    browserMajorVersion: 141,
    context: {hasFocus: true},
    diagnostics: {errorMessage: 'raw'}
  };

  for(const [name, builder] of [
    ['presentationDcApiCancelled', presentationDcApiCancelled],
    ['presentationDcApiError', presentationDcApiError],
    ['presentationDcApiTimeout', presentationDcApiTimeout],
    ['presentationDcApiFlowError', presentationDcApiFlowError]
  ]) {
    it(`${name} spreads the sanitized outcome fields`, () => {
      const {event} = builder({clientId: 'c1', exchangeId: 'e1', outcome});
      for(const [key, value] of Object.entries(outcome)) {
        expect(event[key]).to.eql(value);
      }
    });

    it(`${name} cannot have its type or identifiers overridden by outcome`,
      () => {
        const {event} = builder({
          clientId: 'c1', exchangeId: 'e1',
          outcome: {type: 'spoofed', clientId: 'x', exchangeId: 'y'}
        });
        expect(event.type).not.to.equal('spoofed');
        expect(event.clientId).to.equal('c1');
        expect(event.exchangeId).to.equal('e1');
      });
  }

  it('presentationDcApiFlowError builds expected payload', () => {
    const {logName, event} = presentationDcApiFlowError({
      clientId: 'c1',
      exchangeId: 'e1',
      profiles: ['OID4VP-1.0', 'apple-wallet'],
      errorName: 'HTTPError',
      outcome: {phase: 'fetch', httpStatus: 401}
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_dc_api_flow_error',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined,
      profiles: ['OID4VP-1.0', 'apple-wallet'],
      errorName: 'HTTPError',
      phase: 'fetch',
      httpStatus: 401
    });
  });

  describe('logUtils DC API forwarding', () => {
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

    it('presentationDcApiCancelled forwards errorName', () => {
      logUtils.presentationDcApiCancelled(
        {clientId: 'c1', exchangeId: 'e1', errorName: 'NotAllowedError'});
      expect(logged[0].event.errorName).to.equal('NotAllowedError');
    });

    for(const name of [
      'presentationDcApiCancelled', 'presentationDcApiError',
      'presentationDcApiTimeout', 'presentationDcApiFlowError'
    ]) {
      it(`${name} forwards the outcome fields`, () => {
        logUtils[name]({clientId: 'c1', exchangeId: 'e1', outcome});
        expect(logged[0].event.elapsedMs).to.equal(42);
        expect(logged[0].event.diagnostics).to.eql({errorMessage: 'raw'});
      });
    }
  });
});
