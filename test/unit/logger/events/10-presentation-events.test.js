/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {callbackSuccess} from
  '../../../../lib/logger/events/callbackSuccess.js';
import {legacyProtocolIdentifier} from
  '../../../../lib/logger/events/legacyProtocolIdentifier.js';
import {presentationError} from
  '../../../../lib/logger/events/presentationError.js';
import {presentationStart} from
  '../../../../lib/logger/events/presentationStart.js';
import {presentationSuccess} from
  '../../../../lib/logger/events/presentationSuccess.js';
import {rejectedIssuer} from
  '../../../../lib/logger/events/rejectedIssuer.js';

describe('logger/events pure builders', () => {
  it('presentationStart builds expected payload', () => {
    const {logName, event} = presentationStart({
      clientId: 'c1',
      exchangeId: 'e1',
      profiles: ['OID4VP-1.0']
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_start',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined,
      profiles: ['OID4VP-1.0']
    });
  });

  it('presentationSuccess builds expected payload', () => {
    const {logName, event} = presentationSuccess({
      clientId: 'c1',
      exchangeId: 'e1'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_success',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined
    });
  });

  it('presentationError builds expected payload', () => {
    const {logName, event} = presentationError({
      clientId: 'c1',
      exchangeId: 'e1',
      error: 'bang'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_error',
      clientId: 'c1',
      exchangeId: 'e1',
      error: 'bang'
    });
  });

  it('callbackSuccess builds expected payload', () => {
    const {logName, event} = callbackSuccess({
      clientId: 'c1',
      exchangeId: 'e1'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'callback_success',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined
    });
  });

  it('legacyProtocolIdentifier builds expected payload', () => {
    const md = {observedProtocol: 'openid4vp', source: 'test'};
    const {logName, event} = legacyProtocolIdentifier({
      clientId: 'c1',
      exchangeId: 'e1',
      metadata: md
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'legacy_protocol_identifier',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined,
      metadata: md
    });
  });

  it('rejectedIssuer omits DID when logLevel is info', () => {
    const {logName, event} = rejectedIssuer({
      clientId: 'c1',
      exchangeId: 'e1',
      rejectedIssuer: 'did:example:alice',
      logLevel: 'info'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_error',
      clientId: 'c1',
      exchangeId: 'e1',
      error: 'Unaccepted credential issuer'
    });
    expect(event).not.to.have.key('rejectedIssuer');
  });

  it('rejectedIssuer includes DID when logLevel is debug', () => {
    const {logName, event} = rejectedIssuer({
      clientId: 'c2',
      exchangeId: 'e2',
      rejectedIssuer: 'did:example:bob',
      logLevel: 'debug'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_error',
      clientId: 'c2',
      exchangeId: 'e2',
      error: 'Unaccepted credential issuer',
      rejectedIssuer: 'did:example:bob'
    });
  });
});
