/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {resolveDcApiErrorMessage}
  from '../../../web/utils/dc-api-error-message.js';

const GENERIC_KEY = 'defaultDcApiErrorMessage';
const DEFAULT_KEY = 'error_defaultMessage';
const DEFAULT_MESSAGE = 'An error occurred.';

// Build a stub `t` that returns the given map, falling back to the
// requested key (mirroring vue-i18n's "missing key" behavior).
function makeT(map = {}) {
  return key => (key in map ? map[key] : key);
}

describe('resolveDcApiErrorMessage', () => {
  describe('with empty `defaultDcApiErrorMessage`', () => {
    const t = makeT({
      [GENERIC_KEY]: '',
      [DEFAULT_KEY]: DEFAULT_MESSAGE
    });

    it('returns "" when error is null', () => {
      expect(resolveDcApiErrorMessage({error: null, t})).to.equal('');
    });

    it('returns "" when error is undefined', () => {
      expect(resolveDcApiErrorMessage({error: undefined, t})).to.equal('');
    });

    it('returns the raw string when error is a string', () => {
      expect(resolveDcApiErrorMessage({error: 'boom', t})).to.equal('boom');
    });

    it('returns error.message when error is an object with a message',
      () => {
        const result = resolveDcApiErrorMessage({
          error: {message: 'wallet said no'}, t
        });
        expect(result).to.equal('wallet said no');
      });

    it('falls back to `error_defaultMessage` when error has no message',
      () => {
        const result = resolveDcApiErrorMessage({
          error: {}, t
        });
        expect(result).to.equal(DEFAULT_MESSAGE);
      });
  });

  describe('with non-empty `defaultDcApiErrorMessage`', () => {
    const GENERIC = 'Something went wrong. Please try again.';
    const t = makeT({
      [GENERIC_KEY]: GENERIC,
      [DEFAULT_KEY]: DEFAULT_MESSAGE
    });

    it('returns the generic message when error is null', () => {
      expect(resolveDcApiErrorMessage({error: null, t})).to.equal(GENERIC);
    });

    it('returns the generic message when error is a string', () => {
      expect(resolveDcApiErrorMessage({error: 'boom', t})).to.equal(GENERIC);
    });

    it('returns the generic message when error has a detailed message',
      () => {
        const result = resolveDcApiErrorMessage({
          error: {message: 'wallet said no'}, t
        });
        expect(result).to.equal(GENERIC);
      });

    it('returns the generic message when error has no message', () => {
      const result = resolveDcApiErrorMessage({
        error: {}, t
      });
      expect(result).to.equal(GENERIC);
    });
  });
});
