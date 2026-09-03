/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {buildVersionInfo} from '../../lib/api.js';

describe('buildVersionInfo', () => {
  it('should return the package name and version', () => {
    const result = buildVersionInfo({
      name: 'opencred-platform',
      version: '10.5.0'
    });
    expect(result).to.eql({name: 'opencred-platform', version: '10.5.0'});
  });

  it('should ignore extra package fields', () => {
    const result = buildVersionInfo({
      name: 'opencred-platform',
      version: '10.5.0',
      description: 'ignored',
      scripts: {}
    });
    expect(result).to.eql({name: 'opencred-platform', version: '10.5.0'});
  });

  it('should default missing fields to null', () => {
    expect(buildVersionInfo({})).to.eql({name: null, version: null});
    expect(buildVersionInfo()).to.eql({name: null, version: null});
  });
});
