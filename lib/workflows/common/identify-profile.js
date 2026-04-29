/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';

const WALLET_PROFILES = new Set(['apple-wallet', 'google-wallet']);

/**
 * Hardcoded default OID4VP profile when no explicit profile is requested
 * and no config override is set.
 */
const DEFAULT_OID4VP_PROFILE = 'OID4VP-combined';

// Templates define which components are active for each profile
const TEMPLATES = {
  'OID4VP-draft18': {
    vp_formats: true,
    vp_formats_supported: false,
    presentation_definition: true,
    dcql_query: false
  },
  'OID4VP-1.0': {
    vp_formats: false,
    vp_formats_supported: true,
    presentation_definition: false,
    dcql_query: true
  },
  'OID4VP-combined': {
    vp_formats: true,
    vp_formats_supported: true,
    presentation_definition: true,
    dcql_query: true
  },
  'OID4VP-HAIP-1.0': {
    vp_formats: false,
    vp_formats_supported: true,
    presentation_definition: false,
    dcql_query: true
  }
};

/**
 * Identify the effective profile and response mode from request parameters
 * and workflow configuration.
 *
 * @param {object} options - Options object.
 * @param {string} options.profile - Profile from query parameter.
 * @param {string} options.responseMode - Response mode from query param.
 * @param {string} [options.clientIdScheme] - Client ID scheme from
 *   query param.
 * @param {object} options.workflow - The workflow configuration.
 * @returns {object} Object containing profile, responseMode, and
 *   clientIdScheme.
 */
export function identifyProfile({
  profile: profileParam,
  responseMode: responseModeParam,
  clientIdScheme: clientIdSchemeParam,
  workflow
} = {}) {
  // Step 1: Resolve base profile from parameter or config default
  let resolvedProfile = profileParam;
  if(!resolvedProfile) {
    resolvedProfile = config.opencred?.options?.OID4VPdefault ||
      DEFAULT_OID4VP_PROFILE;
  }

  // Map legacy 'OID4VP' to the default profile
  if(resolvedProfile === 'OID4VP') {
    resolvedProfile = DEFAULT_OID4VP_PROFILE;
  }

  // Ensure profile is valid, default to the built-in fallback if not
  if(
    !TEMPLATES[resolvedProfile] &&
    !resolvedProfile.startsWith('18013-7-') &&
    !WALLET_PROFILES.has(resolvedProfile)
  ) {
    resolvedProfile = DEFAULT_OID4VP_PROFILE;
  }

  // Step 2: Handle 18013-7-Annex-D and 18013-7-Annex-C profile refinement
  // Check if dcApiNamespaceQuery is present at workflow level
  if(resolvedProfile === '18013-7-Annex-D' && workflow?.dcApiNamespaceQuery) {
    // Use SpruceID handler when dcApiNamespaceQuery is present
    return {
      profile: '18013-7-Annex-D-spruceid',
      responseMode: responseModeParam || 'dc_api'
    };
  }
  if(resolvedProfile === '18013-7-Annex-C' && workflow?.dcApiNamespaceQuery) {
    // Use SpruceID handler when dcApiNamespaceQuery is present
    return {
      profile: '18013-7-Annex-C-spruceid',
      responseMode: responseModeParam || 'dc_api'
    };
  }

  if(resolvedProfile === 'apple-wallet') {
    return {
      profile: 'apple-wallet',
      responseMode: responseModeParam || 'dc_api',
      clientIdScheme: clientIdSchemeParam
    };
  }
  if(resolvedProfile === 'google-wallet') {
    return {
      profile: 'google-wallet',
      responseMode: responseModeParam || 'dc_api',
      clientIdScheme: clientIdSchemeParam || 'x509_hash'
    };
  }

  // Step 3: Determine response mode based on profile and parameter
  let responseMode = 'direct_post'; // Default for standard OID4VP

  // For 18013-7 profiles, determine response mode
  if(resolvedProfile === '18013-7-Annex-B') {
    responseMode = 'direct_post';
  } else if(resolvedProfile === '18013-7-Annex-C') {
    // Annex-C uses dc_api response mode with HPKE encryption
    responseMode = responseModeParam || 'dc_api';
  } else if(resolvedProfile === '18013-7-Annex-D' ||
    resolvedProfile === '18013-7-Annex-D-spruceid' ||
    resolvedProfile === '18013-7-Annex-C-spruceid') {
    // Default to dc_api for Annex-D and Annex-C-spruceid, but allow override
    responseMode = responseModeParam || 'dc_api';
  } else if(resolvedProfile === 'OID4VP-HAIP-1.0') {
    // HAIP profile requires encrypted responses
    responseMode = responseModeParam || 'dc_api.jwt';
  } else if(responseModeParam === 'dc_api' ||
    responseModeParam === 'dc_api.jwt') {
    // For standard OID4VP profiles, use provided response mode
    responseMode = responseModeParam;
  }

  return {
    profile: resolvedProfile,
    responseMode,
    clientIdScheme: clientIdSchemeParam || 'did'
  };
}
