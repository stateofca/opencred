/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {presentationDcApiCancelled} from
  '../../../../lib/logger/events/presentationDcApiCancelled.js';
import {presentationDcApiError} from
  '../../../../lib/logger/events/presentationDcApiError.js';
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
});
