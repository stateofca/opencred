/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * List all credential formats supported by the platform.
 * Used for format-agnostic protocols (e.g. Interact URL).
 */
export const ALL_CREDENTIAL_FORMATS = ['ldp_vc', 'jwt_vc_json', 'mso_mdoc'];

/**
 * Default mapping of protocols to supported credential formats.
 * Wallets can override/extend these defaults in their configurations.
 */
export const PROTOCOL_FORMAT_MAPPING = {
  'OID4VP-draft18': ['ldp_vc', 'jwt_vc_json'],
  'OID4VP-1.0': ['ldp_vc', 'jwt_vc_json'],
  'OID4VP-combined': ['ldp_vc', 'jwt_vc_json'],
  OID4VP: ['ldp_vc', 'jwt_vc_json'],
  'OID4VP-haip-1.0': ['ldp_vc', 'jwt_vc_json'],
  '18013-7-Annex-C': ['mso_mdoc'],
  '18013-7-Annex-D': ['mso_mdoc'],

  // Todo: vcapi and chapi could also support the other formats,
  // but unclear exactly how yet
  vcapi: ['ldp_vc'],
  interact: ALL_CREDENTIAL_FORMATS,
  chapi: ['ldp_vc'] // 'chapi' is shorthand for the 'web credential request'
  // request format including a VerifiablePresentationRequest query with
  // QueryByExample. This is the predominant method of passing a query through
  // the CHAPI interaction method.
};
