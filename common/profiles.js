/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * List of all available profiles in the system.
 * This is a common reference that can be imported and consulted.
 */
export const PROFILES_LIST = [
  'chapi',
  'OID4VP', // default version for the platform, can change over time
  'OID4VP-draft18', // uses input_descriptors
  'OID4VP-1.0', // uses dcql_query
  'OID4VP-combined', // both input_descriptors and dcql_query
  'OID4VP-haip-1.0',
  'interact', // https interaction URL. TODO: add `interaction:` custom protocol
  'vcapi',
  '18013-7-Annex-B',
  '18013-7-Annex-C',
  '18013-7-Annex-D'
];

/**
 * Metadata for profile display (i18n keys).
 * Maps each profile to nameKey and descriptionKey for use in the UI.
 */
export const PROFILE_METADATA = Object.fromEntries(
  PROFILES_LIST.map(profile => [
    profile,
    {
      nameKey: `profiles_${profile}_name`,
      descriptionKey: `profiles_${profile}_description`
    }
  ])
);
