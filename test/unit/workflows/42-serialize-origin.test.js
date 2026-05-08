/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {serializeOrigin}
  from '../../../lib/workflows/common/serialize-origin.js';

describe('serializeOrigin', () => {
  it('strips a trailing slash', () => {
    expect(serializeOrigin('https://example.com/'))
      .to.equal('https://example.com');
  });

  it('strips a path component', () => {
    expect(serializeOrigin('https://example.com/some/path'))
      .to.equal('https://example.com');
  });

  it('strips query and fragment', () => {
    expect(serializeOrigin('https://example.com/?a=1#frag'))
      .to.equal('https://example.com');
  });

  it('strips the default https port', () => {
    expect(serializeOrigin('https://example.com:443/'))
      .to.equal('https://example.com');
  });

  it('strips the default http port', () => {
    expect(serializeOrigin('http://example.com:80/'))
      .to.equal('http://example.com');
  });

  it('preserves a non-default port', () => {
    expect(serializeOrigin('https://example.com:8443/'))
      .to.equal('https://example.com:8443');
  });

  it('is a no-op on an already-serialized origin', () => {
    expect(serializeOrigin('https://example.com'))
      .to.equal('https://example.com');
  });

  it('throws on an invalid URI', () => {
    expect(() => serializeOrigin('not-a-url')).to.throwError();
  });
});
