/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {domainToDidWeb} from '../../common/didWeb.js';
import expect from 'expect.js';

describe('domainToDidWeb', () => {
  it('converts a bare HTTPS origin', () => {
    expect(domainToDidWeb('https://example.com'))
      .to.equal('did:web:example.com');
  });

  it('ignores a trailing slash', () => {
    expect(domainToDidWeb('https://example.com/'))
      .to.equal('did:web:example.com');
  });

  it('percent-encodes the port colon', () => {
    expect(domainToDidWeb('https://localhost:22443'))
      .to.equal('did:web:localhost%3A22443');
  });

  it('omits the default HTTPS port', () => {
    expect(domainToDidWeb('https://example.com:443'))
      .to.equal('did:web:example.com');
  });

  it('converts path segments to colon-separated segments', () => {
    expect(domainToDidWeb('https://example.com/opencred'))
      .to.equal('did:web:example.com:opencred');
  });
});
