/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {formatVersion} from '../../../web/utils/version.js';

describe('version', () => {
  describe('formatVersion', () => {
    it('should prefix a semver string with "v"', () => {
      expect(formatVersion('10.5.0')).to.equal('v10.5.0');
    });

    it('should keep a prerelease suffix', () => {
      expect(formatVersion('10.5.0-rc.1')).to.equal('v10.5.0-rc.1');
    });

    it('should trim surrounding whitespace', () => {
      expect(formatVersion('  10.5.0  ')).to.equal('v10.5.0');
    });

    it('should return an empty string for an empty version', () => {
      expect(formatVersion('')).to.equal('');
    });

    it('should return an empty string for a whitespace-only version', () => {
      expect(formatVersion('   ')).to.equal('');
    });

    it('should return an empty string for a missing version', () => {
      expect(formatVersion()).to.equal('');
      expect(formatVersion(null)).to.equal('');
    });

    it('should return an empty string for a non-string version', () => {
      expect(formatVersion(10.5)).to.equal('');
      expect(formatVersion({})).to.equal('');
    });
  });
});
