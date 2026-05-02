/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Normalize decoded MDL CBOR (nested Maps) to plain objects for expect.js.
 *
 * @param {*} value - Decoded CBOR value.
 * @returns {*} Plain JSON-compatible structure.
 */
export function mapsToPlain(value) {
  if(value instanceof Map) {
    const o = {};
    for(const [k, v] of value) {
      o[k] = mapsToPlain(v);
    }
    return o;
  }
  if(Array.isArray(value)) {
    return value.map(mapsToPlain);
  }
  return value;
}
