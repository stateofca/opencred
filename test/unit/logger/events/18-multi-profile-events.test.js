/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {presentationDcApiCancelled} from
  '../../../../lib/logger/events/presentationDcApiCancelled.js';
import {presentationDcApiTimeout} from
  '../../../../lib/logger/events/presentationDcApiTimeout.js';
import {presentationDcApiUnresolved} from
  '../../../../lib/logger/events/presentationDcApiUnresolved.js';
import {presentationError} from
  '../../../../lib/logger/events/presentationError.js';
import {presentationResponseReceived} from
  '../../../../lib/logger/events/presentationResponseReceived.js';
import {presentationStart} from
  '../../../../lib/logger/events/presentationStart.js';
import {presentationSuccess} from
  '../../../../lib/logger/events/presentationSuccess.js';

// Fields that must never appear in any event payload. Profile identifiers,
// protocol identifiers, error names, and the random `requestGroupId` are safe;
// anything carrying credential content or key material is not.
const FORBIDDEN_FIELDS = [
  'authorizationRequest', 'deviceRequest', 'encryptionInfo', 'vp_token',
  'vpToken', 'credentialSubject', 'hpkeRecipientPrivateKey',
  'ephemeralKeyAgreementPrivateKey', 'response', 'data', 'userAgent'
];

function expectNoForbiddenFields(event) {
  for(const field of FORBIDDEN_FIELDS) {
    expect(event).to.not.have.property(field);
  }
}

describe('multi-profile presentation events', () => {
  // One event per authorization request call, not one per profile: it
  // represents the single button press that offered them together.
  describe('presentationStart', () => {
    it('reports the profiles offered together, plus the group id', () => {
      const {event} = presentationStart({
        clientId: 'c1',
        exchangeId: 'e1',
        profiles: ['apple-wallet', 'google-wallet'],
        requestGroupId: 'g1'
      });
      expect(event.type).to.equal('presentation_start');
      expect(event.profiles).to.eql(['apple-wallet', 'google-wallet']);
      expect(event.requestGroupId).to.equal('g1');
      // Never a singular key: the event carries the collection only.
      expect(event).to.not.have.property('profile');
      expectNoForbiddenFields(event);
    });

    it('carries a single-element collection for a single-profile call', () => {
      const {event} = presentationStart({
        clientId: 'c1', exchangeId: 'e1', profiles: ['OID4VP-1.0']
      });
      expect(event.profiles).to.eql(['OID4VP-1.0']);
      expect(event).to.not.have.property('profile');
    });

    it('names entra for the Entra workflow', () => {
      const {event} = presentationStart({
        clientId: 'c1', exchangeId: 'e1', profiles: ['entra']
      });
      expect(event.profiles).to.eql(['entra']);
      expect(event).to.not.have.property('profile');
    });

    it('emits an empty collection when no profile is given', () => {
      const {event} = presentationStart({clientId: 'c1', exchangeId: 'e1'});
      // Empty, not absent: an empty set is a signal, not a suppressed key.
      expect(event.profiles).to.eql([]);
      expect(event).to.not.have.property('profile');
    });
  });

  // Emitted on arrival, so "a response arrived" stays measurable against
  // "a response succeeded". Which profile answered is not known yet.
  describe('presentationResponseReceived', () => {
    it('carries the response protocol and group id', () => {
      const {event} = presentationResponseReceived({
        clientId: 'c1',
        exchangeId: 'e1',
        protocol: 'org-iso-mdoc',
        requestGroupId: 'g1'
      });
      expect(event.type).to.equal('presentation_response_received');
      expect(event.protocol).to.equal('org-iso-mdoc');
      expect(event.requestGroupId).to.equal('g1');
      expectNoForbiddenFields(event);
    });

    it('omits both when there is nothing to report', () => {
      const {event} = presentationResponseReceived({
        clientId: 'c1', exchangeId: 'e1'
      });
      expect(event).to.not.have.property('protocol');
      expect(event).to.not.have.property('requestGroupId');
    });
  });

  describe('presentationSuccess', () => {
    // The winning profile: read off the exchange the response handler was
    // given, so it is the profile that actually answered.
    it('carries the answering profile and group id', () => {
      const {event} = presentationSuccess({
        clientId: 'c1',
        exchangeId: 'e1',
        profile: 'google-wallet',
        requestGroupId: 'g1'
      });
      expect(event.profile).to.equal('google-wallet');
      expect(event.requestGroupId).to.equal('g1');
      expectNoForbiddenFields(event);
    });
  });

  describe('presentationError', () => {
    it('names one profile when the failure is attributable', () => {
      const {event} = presentationError({
        clientId: 'c1',
        exchangeId: 'e1',
        error: 'boom',
        profile: 'apple-wallet',
        requestGroupId: 'g1'
      });
      expect(event.profile).to.equal('apple-wallet');
      expect(event.requestGroupId).to.equal('g1');
      expect(event).to.not.have.property('profiles');
    });

    it('reports the whole set when the failure is not attributable', () => {
      const {event} = presentationError({
        clientId: 'c1',
        exchangeId: 'e1',
        error: 'boom',
        profiles: ['apple-wallet', 'google-wallet'],
        requestGroupId: 'g1'
      });
      expect(event.profiles).to.eql(['apple-wallet', 'google-wallet']);
      expect(event).to.not.have.property('profile');
    });
  });

  // A response that matched no pending request knows the protocol answered and
  // what was pending, but by definition not which profile answered. Its own
  // type so it stays queryable, and so an absent `profile` is not misread as
  // "unknown profile" rather than "not attributable".
  describe('presentationDcApiUnresolved', () => {
    it('reports protocol and candidates, never a single profile', () => {
      const {logName, event} = presentationDcApiUnresolved({
        clientId: 'c1',
        exchangeId: 'e1',
        protocol: 'openid4vp-v1-unsigned',
        candidateProfiles: ['apple-wallet', 'google-wallet'],
        requestGroupId: 'g1',
        error: 'no pending request matches'
      });
      expect(logName).to.equal('presentation_event');
      expect(event.type).to.equal('presentation_dc_api_unresolved');
      expect(event.protocol).to.equal('openid4vp-v1-unsigned');
      expect(event.candidateProfiles)
        .to.eql(['apple-wallet', 'google-wallet']);
      expect(event.requestGroupId).to.equal('g1');
      expect(event).to.not.have.property('profile');
      expectNoForbiddenFields(event);
    });

    it('omits empty candidate lists', () => {
      const {event} = presentationDcApiUnresolved({
        clientId: 'c1', exchangeId: 'e1', candidateProfiles: []
      });
      expect(event).to.not.have.property('candidateProfiles');
    });
  });

  // The user dismissed the platform sheet, so NO profile answered. Naming one
  // would be a fabrication.
  describe('DC API outcomes with no answering wallet', () => {
    it('cancellation reports the whole offered set and no single profile',
      () => {
        const {event} = presentationDcApiCancelled({
          clientId: 'c1',
          exchangeId: 'e1',
          profiles: ['apple-wallet', 'google-wallet'],
          requestGroupId: 'g1'
        });
        expect(event.type).to.equal('presentation_dc_api_cancelled');
        expect(event.profiles).to.eql(['apple-wallet', 'google-wallet']);
        expect(event).to.not.have.property('profile');
        expect(event.requestGroupId).to.equal('g1');
        expectNoForbiddenFields(event);
      });

    it('timeout reports the whole offered set', () => {
      const {event} = presentationDcApiTimeout({
        clientId: 'c1',
        exchangeId: 'e1',
        profiles: ['apple-wallet', 'google-wallet'],
        timeoutMs: 30000,
        requestGroupId: 'g1'
      });
      expect(event.profiles).to.eql(['apple-wallet', 'google-wallet']);
      expect(event.timeoutMs).to.equal(30000);
      expectNoForbiddenFields(event);
    });

    it('keeps the singular profile when only one was offered', () => {
      const {event} = presentationDcApiCancelled({
        clientId: 'c1',
        exchangeId: 'e1',
        profile: 'OID4VP-1.0',
        profiles: ['OID4VP-1.0']
      });
      expect(event.profile).to.equal('OID4VP-1.0');
      expect(event.profiles).to.eql(['OID4VP-1.0']);
    });
  });
});
