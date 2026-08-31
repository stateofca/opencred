/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {BRAND_COLOR_FIELDS, pickBrandColors} from '../../../web/utils/brand.js';

const FULL_BRAND = {
  cta: '#0B669D',
  primary: '#045199',
  header: '#0979c4',
  primaryLogo: 'https://example.com/ca-gov.svg',
  secondaryLogo: {id: 'https://example.com/ca-dmv.svg', alt: 'CA DMV Logo'},
  primaryLink: 'https://ca.gov',
  secondaryLink: 'https://dmv.ca.gov',
  homeLink: 'https://example.com',
  backgroundImage: 'https://example.com/hero.png',
  showQuerySummary: false
};

describe('brand', () => {
  describe('BRAND_COLOR_FIELDS', () => {
    it('should list the hex color fields of the brand schema', () => {
      expect(BRAND_COLOR_FIELDS).to.eql(['cta', 'primary', 'header']);
    });
  });

  describe('pickBrandColors', () => {
    it('should keep the color fields', () => {
      const result = pickBrandColors(FULL_BRAND);
      expect(result.cta).to.equal('#0B669D');
      expect(result.primary).to.equal('#045199');
      expect(result.header).to.equal('#0979c4');
    });

    it('should drop links, images, and flags', () => {
      const result = pickBrandColors(FULL_BRAND);
      expect(Object.keys(result)).to.eql(['cta', 'primary', 'header']);
      expect(result.primaryLogo).to.be(undefined);
      expect(result.secondaryLogo).to.be(undefined);
      expect(result.primaryLink).to.be(undefined);
      expect(result.secondaryLink).to.be(undefined);
      expect(result.homeLink).to.be(undefined);
      expect(result.backgroundImage).to.be(undefined);
      expect(result.showQuerySummary).to.be(undefined);
    });

    it('should include only the colors a partial brand sets', () => {
      const result = pickBrandColors({
        primary: '#045199',
        homeLink: 'https://example.com'
      });
      expect(result).to.eql({primary: '#045199'});
    });

    it('should return an empty object for a brand with no colors', () => {
      expect(pickBrandColors({homeLink: 'https://example.com'})).to.eql({});
    });

    it('should return an empty object for a missing brand', () => {
      expect(pickBrandColors(undefined)).to.eql({});
      expect(pickBrandColors(null)).to.eql({});
      expect(pickBrandColors('#045199')).to.eql({});
    });
  });
});
