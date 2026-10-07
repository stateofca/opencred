/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  MAX_DC_API_TEXT_LENGTH,
  sanitizeDcApiOutcome
} from '../../lib/dcApiOutcomeFields.js';
import {createHash} from 'node:crypto';
import expect from 'expect.js';

const CHROME_ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/141.0.0.0 Mobile Safari/537.36';

function hash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

describe('sanitizeDcApiOutcome', () => {
  describe('always-on fields', () => {
    it('adds os and browserMajorVersion from the User-Agent', () => {
      const fields = sanitizeDcApiOutcome(
        {body: {}, userAgent: CHROME_ANDROID_UA});
      expect(fields.os).to.equal('android');
      expect(fields.browserMajorVersion).to.equal(141);
    });

    it('keeps a whole, in-range elapsedMs', () => {
      expect(sanitizeDcApiOutcome({body: {elapsedMs: 1234}}).elapsedMs)
        .to.equal(1234);
    });

    it('rounds a fractional elapsedMs', () => {
      expect(sanitizeDcApiOutcome({body: {elapsedMs: 12.7}}).elapsedMs)
        .to.equal(13);
    });

    it('drops an out-of-range or non-numeric elapsedMs', () => {
      for(const elapsedMs of [-1, 10 * 60 * 1000 + 1, '5', NaN, Infinity]) {
        expect(sanitizeDcApiOutcome({body: {elapsedMs}}))
          .not.to.have.key('elapsedMs');
      }
    });

    it('keeps a small integer DOMException errorCode', () => {
      expect(sanitizeDcApiOutcome({body: {errorCode: 19}}).errorCode)
        .to.equal(19);
      expect(sanitizeDcApiOutcome({body: {errorCode: 0}}).errorCode)
        .to.equal(0);
    });

    it('drops a non-integer or out-of-range errorCode', () => {
      for(const errorCode of [1.5, -1, 1001, '19']) {
        expect(sanitizeDcApiOutcome({body: {errorCode}}))
          .not.to.have.key('errorCode');
      }
    });

    it('hashes errorMessage so distinct unmapped messages can be counted',
      () => {
        const fields = sanitizeDcApiOutcome(
          {body: {errorMessage: 'Error retrieving a token.'}});
        expect(fields.errorMessageHash)
          .to.equal(hash('Error retrieving a token.'));
        expect(fields.errorMessageHash).to.match(/^[0-9a-f]{16}$/);
      });

    it('hashes the capped message, not the raw body text', () => {
      const long = 'y'.repeat(MAX_DC_API_TEXT_LENGTH + 50);
      const fields = sanitizeDcApiOutcome({body: {errorMessage: long}});
      expect(fields.errorMessageHash)
        .to.equal(hash(long.slice(0, MAX_DC_API_TEXT_LENGTH)));
    });

    it('omits errorMessageHash for an empty or non-string message', () => {
      for(const errorMessage of ['', 42, {}, undefined]) {
        expect(sanitizeDcApiOutcome({body: {errorMessage}}))
          .not.to.have.key('errorMessageHash');
      }
    });

    it('keeps a known phase and drops anything else', () => {
      expect(sanitizeDcApiOutcome({body: {phase: 'fetch'}}).phase)
        .to.equal('fetch');
      expect(sanitizeDcApiOutcome({body: {phase: 'submit'}}).phase)
        .to.equal('submit');
      expect(sanitizeDcApiOutcome({body: {phase: 'rm -rf'}}))
        .not.to.have.key('phase');
    });

    it('keeps a valid httpStatus and drops anything else', () => {
      expect(sanitizeDcApiOutcome({body: {httpStatus: 401}}).httpStatus)
        .to.equal(401);
      for(const httpStatus of [99, 600, '401', 401.5]) {
        expect(sanitizeDcApiOutcome({body: {httpStatus}}))
          .not.to.have.key('httpStatus');
      }
    });

    it('never returns raw client text when diagnostics are disabled', () => {
      const fields = sanitizeDcApiOutcome({
        body: {
          errorMessage: 'raw message',
          errorCause: 'raw cause'
        },
        userAgent: CHROME_ANDROID_UA
      });
      expect(fields).not.to.have.key('diagnostics');
      expect(fields).not.to.have.key('errorMessage');
      expect(fields).not.to.have.key('errorCause');
      expect(JSON.stringify(fields)).not.to.contain('raw');
      expect(JSON.stringify(fields)).not.to.contain('Pixel');
    });
  });

  describe('context', () => {
    const context = {
      userActivationIsActive: false,
      userActivationHasBeenActive: true,
      visibilityState: 'visible',
      hasFocus: true,
      inIframe: false,
      digitalCredentialDefined: true,
      protocolSupport: [
        {protocol: 'openid4vp-v1-signed', allowed: true},
        {protocol: 'org-iso-mdoc', allowed: false},
        {protocol: 'openid4vp-v1-unsigned', allowed: null}
      ]
    };

    it('keeps known, well-typed context fields', () => {
      expect(sanitizeDcApiOutcome({body: {context}}).context)
        .to.eql(context);
    });

    it('drops unknown keys and wrongly typed values', () => {
      const fields = sanitizeDcApiOutcome({body: {context: {
        userActivationIsActive: 'yes',
        visibilityState: 'sideways',
        hasFocus: true,
        injected: 'arbitrary text'
      }}});
      expect(fields.context).to.eql({hasFocus: true});
    });

    it('drops protocolSupport entries with a malformed protocol or value',
      () => {
        const fields = sanitizeDcApiOutcome({body: {context: {
          protocolSupport: [
            {protocol: 'openid4vp-v1-signed', allowed: true},
            {protocol: 'has spaces', allowed: true},
            {protocol: 'x'.repeat(101), allowed: true},
            {protocol: 'org-iso-mdoc', allowed: 'maybe'},
            'not an object'
          ]
        }}});
        expect(fields.context.protocolSupport).to.eql(
          [{protocol: 'openid4vp-v1-signed', allowed: true}]);
      });

    it('caps protocolSupport at 10 entries', () => {
      const protocolSupport = Array.from(
        {length: 20}, (_, i) => ({protocol: `p${i}`, allowed: true}));
      const fields = sanitizeDcApiOutcome(
        {body: {context: {protocolSupport}}});
      expect(fields.context.protocolSupport.length).to.equal(10);
    });

    it('omits context when it is missing, not an object, or empty', () => {
      for(const value of [undefined, 'text', [], {}, {injected: 'x'}]) {
        expect(sanitizeDcApiOutcome({body: {context: value}}))
          .not.to.have.key('context');
      }
    });
  });

  describe('diagnostics (enabled)', () => {
    it('adds raw errorMessage, errorCause, and userAgent', () => {
      const fields = sanitizeDcApiOutcome({
        body: {errorMessage: 'raw message', errorCause: 'raw cause'},
        userAgent: CHROME_ANDROID_UA,
        diagnosticsEnabled: true
      });
      expect(fields.diagnostics).to.eql({
        errorMessage: 'raw message',
        errorCause: 'raw cause',
        userAgent: CHROME_ANDROID_UA
      });
    });

    it('caps every raw text field', () => {
      const long = 'z'.repeat(MAX_DC_API_TEXT_LENGTH + 50);
      const {diagnostics} = sanitizeDcApiOutcome({
        body: {errorMessage: long, errorCause: long},
        userAgent: long,
        diagnosticsEnabled: true
      });
      expect(diagnostics.errorMessage.length).to.equal(MAX_DC_API_TEXT_LENGTH);
      expect(diagnostics.errorCause.length).to.equal(MAX_DC_API_TEXT_LENGTH);
      expect(diagnostics.userAgent.length).to.equal(MAX_DC_API_TEXT_LENGTH);
    });

    it('omits raw fields that are absent or not strings', () => {
      const {diagnostics} = sanitizeDcApiOutcome({
        body: {errorMessage: 42},
        diagnosticsEnabled: true
      });
      expect(diagnostics).to.eql({});
    });

    it('still includes the always-on fields', () => {
      const fields = sanitizeDcApiOutcome({
        body: {errorMessage: 'm', elapsedMs: 5},
        diagnosticsEnabled: true
      });
      expect(fields.elapsedMs).to.equal(5);
      expect(fields.errorMessageHash).to.equal(hash('m'));
    });
  });
});
