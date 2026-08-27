/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {presentationError} from
  '../../../../lib/logger/events/presentationError.js';
import {presentationInitiated} from
  '../../../../lib/logger/events/presentationInitiated.js';
import {presentationRequestServed} from
  '../../../../lib/logger/events/presentationRequestServed.js';
import {presentationResponseReceived} from
  '../../../../lib/logger/events/presentationResponseReceived.js';
import {presentationSuccess} from
  '../../../../lib/logger/events/presentationSuccess.js';

describe('logger/events funnel builders', () => {
  it('presentationInitiated builds expected payload', () => {
    const {logName, event} = presentationInitiated({
      clientId: 'c1',
      exchangeId: 'e1'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_initiated',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined
    });
  });

  it('presentationInitiated defaults missing identifiers to unknown', () => {
    const {event} = presentationInitiated({});
    expect(event.clientId).to.equal('unknown');
    expect(event.exchangeId).to.equal('unknown');
  });

  it('presentationRequestServed builds expected payload', () => {
    const {logName, event} = presentationRequestServed({
      clientId: 'c1',
      exchangeId: 'e1',
      profile: 'OID4VP-1.0',
      responseMode: 'direct_post.jwt',
      wire: 'jar-jwt'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_request_served',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined,
      profile: 'OID4VP-1.0',
      responseMode: 'direct_post.jwt',
      wire: 'jar-jwt'
    });
  });

  it('presentationRequestServed omits absent optional fields', () => {
    const {event} = presentationRequestServed({
      clientId: 'c1',
      exchangeId: 'e1'
    });
    expect(event).to.eql({
      type: 'presentation_request_served',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined
    });
    expect(event).not.to.have.key('profile');
    expect(event).not.to.have.key('responseMode');
    expect(event).not.to.have.key('wire');
  });

  it('presentationResponseReceived builds expected payload', () => {
    const {logName, event} = presentationResponseReceived({
      clientId: 'c1',
      exchangeId: 'e1'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_response_received',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined
    });
  });

  it('presentationSuccess includes profile when provided', () => {
    const {event} = presentationSuccess({
      clientId: 'c1',
      exchangeId: 'e1',
      profile: 'OID4VP-1.0'
    });
    expect(event).to.eql({
      type: 'presentation_success',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined,
      profile: 'OID4VP-1.0'
    });
  });

  it('presentationSuccess omits profile when absent', () => {
    const {event} = presentationSuccess({
      clientId: 'c1',
      exchangeId: 'e1'
    });
    expect(event).not.to.have.key('profile');
  });

  it('presentationError includes profile when provided', () => {
    const {event} = presentationError({
      clientId: 'c1',
      exchangeId: 'e1',
      error: 'bang',
      profile: 'OID4VP-1.0'
    });
    expect(event).to.eql({
      type: 'presentation_error',
      clientId: 'c1',
      exchangeId: 'e1',
      error: 'bang',
      profile: 'OID4VP-1.0'
    });
  });

  it('presentationError omits profile when absent', () => {
    const {event} = presentationError({
      clientId: 'c1',
      exchangeId: 'e1',
      error: 'bang'
    });
    expect(event).not.to.have.key('profile');
  });
});
