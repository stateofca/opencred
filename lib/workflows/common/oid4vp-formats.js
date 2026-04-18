/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * OID4VP 1.0 `mso_mdoc` format object for `vp_formats_supported`.
 * Per OpenID for Verifiable Presentations 1.0 §B.2.6.1; algorithm
 * identifiers are COSE integers from the IANA "COSE Algorithms" registry
 * (e.g. `-7` for ES256).
 *
 * @returns {object} Shallow-frozen format descriptor.
 */
export function msoMdocFormatOid4vp10() {
  return Object.freeze({
    issuerauth_alg_values: [-7],
    deviceauth_alg_values: [-7]
  });
}

/**
 * Pre-OID4VP-1.0 `mso_mdoc` format object for `vp_formats`.
 * Kept for the standard / draft-18 path until that path is upgraded
 * separately. Do not use for Annex D, Annex C, or HAIP.
 *
 * @returns {object} Shallow-frozen format descriptor.
 */
export function msoMdocFormatLegacy() {
  return Object.freeze({alg: ['ES256']});
}

/**
 * Unused at this time, documenting spec expectations for future use.
 * SD-JWT VC format object for `vp_formats_supported`.
 * Per OpenID for Verifiable Presentations 1.0 §B.2.6 (SD-JWT VC).
 *
 * @returns {object} Shallow-frozen format descriptor.
 */
export function sdJwtVcFormatOid4vp10() {
  return Object.freeze({
    'sd-jwt_alg_values': ['ES256'],
    'kb-jwt_alg_values': ['ES256']
  });
}
