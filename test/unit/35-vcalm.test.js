/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {toErrorMessage} from '../../common/vcalm.js';

describe('toErrorMessage', () => {
  it('should return undefined for null', () => {
    expect(toErrorMessage(null)).to.be(undefined);
  });

  it('should return undefined for undefined', () => {
    expect(toErrorMessage(undefined)).to.be(undefined);
  });

  it('should return the string for string input', () => {
    expect(toErrorMessage('test error message')).to.equal('test error message');
    expect(toErrorMessage('')).to.equal('');
  });

  it('should return message for Error instance', () => {
    const error = new Error('Test error');
    expect(toErrorMessage(error)).to.equal('Test error');
  });

  it('should return message for object with string message property', () => {
    expect(toErrorMessage({message: 'foo'})).to.equal('foo');
    expect(toErrorMessage({message: 'bar', other: 'prop'})).to.equal('bar');
  });

  it('should return undefined for empty object', () => {
    expect(toErrorMessage({})).to.be(undefined);
  });

  it('should return undefined for object with non-string message', () => {
    expect(toErrorMessage({message: 123})).to.be(undefined);
    expect(toErrorMessage({message: null})).to.be(undefined);
    expect(toErrorMessage({message: {}})).to.be(undefined);
    expect(toErrorMessage({message: []})).to.be(undefined);
  });

  it('should return undefined for object without message property', () => {
    expect(toErrorMessage({other: 'prop'})).to.be(undefined);
    expect(toErrorMessage({code: 500})).to.be(undefined);
  });

  it('should handle Error-like objects', () => {
    const errorLike = {
      message: 'Custom error',
      stack: 'stack trace',
      name: 'CustomError'
    };
    expect(toErrorMessage(errorLike)).to.equal('Custom error');
  });
});
