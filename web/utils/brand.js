/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * The brand fields that hold a color, matching the hex-validated fields in
 * `BrandSchema`. Every other brand field is a link, an image, or a flag, so
 * only these may become Quasar `--q-*` CSS variables.
 */
export const BRAND_COLOR_FIELDS = ['cta', 'primary', 'header'];

/**
 * Picks the color fields out of a brand object, keyed by the Quasar brand
 * name so each entry maps to a `--q-<name>` CSS variable.
 *
 * @param {object} [brand] - A resolved workflow brand, or the deployment
 *   default brand.
 * @returns {object} The brand's color fields; empty when it has none.
 */
export function pickBrandColors(brand) {
  const colors = {};
  if(!brand || typeof brand !== 'object') {
    return colors;
  }
  for(const field of BRAND_COLOR_FIELDS) {
    if(typeof brand[field] === 'string') {
      colors[field] = brand[field];
    }
  }
  return colors;
}
