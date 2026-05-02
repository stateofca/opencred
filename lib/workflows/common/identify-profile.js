/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';

const WALLET_PROFILES = new Set([
  'apple-wallet', 'google-wallet', 'cadmv-android', 'cadmv-ios'
]);

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
 * Identify the effective profile, response mode, client ID scheme, and
 * whether the request should be signed from request parameters and
 * workflow configuration.
 *
 * @param {object} options - Options object.
 * @param {string} options.profile - Profile from query parameter.
 * @param {string} options.responseMode - Response mode from query param.
 * @param {string} [options.clientIdScheme] - Client ID scheme from
 *   query param.
 * @param {object} options.workflow - The workflow configuration.
 * @returns {object} Object containing profile, responseMode,
 *   clientIdScheme, and signed.
 */
export function identifyProfile({
  profile: profileParam,
  responseMode: responseModeParam,
  clientIdScheme: clientIdSchemeParam,
  workflow
} = {}) {
  // Step 1: Refine & validate profile id from parameter or config default
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

  // Step 2: DC API profiles — route to `@spruceid/opencred-dc-api` when
  // `dcApiNamespaceQuery` is set; otherwise use the in-house handler.
  // `cadmv-android` / `18013-7-Annex-D` (Android lane) share D-spruceid.
  // `cadmv-ios` / `18013-7-Annex-C` (iOS lane) share C-spruceid.
  if(resolvedProfile === 'cadmv-android' ||
    resolvedProfile === '18013-7-Annex-D') {
    if(workflow?.dcApiNamespaceQuery) {
      return {
        profile: '18013-7-Annex-D-spruceid',
        responseMode: responseModeParam || 'dc_api',
        clientIdScheme: 'x509_san_dns',
        signed: true
      };
    }
    return {
      profile: resolvedProfile === '18013-7-Annex-D' ?
        '18013-7-Annex-D' : 'cadmv-android',
      responseMode: responseModeParam || 'dc_api',
      clientIdScheme: 'x509_san_dns',
      signed: true
    };
  }
  if(resolvedProfile === 'cadmv-ios' ||
    resolvedProfile === '18013-7-Annex-C') {
    if(workflow?.dcApiNamespaceQuery) {
      return {
        profile: '18013-7-Annex-C-spruceid',
        responseMode: responseModeParam || 'dc_api',
        clientIdScheme: clientIdSchemeParam,
        signed: true
      };
    }
    return {
      profile: resolvedProfile === '18013-7-Annex-C' ?
        '18013-7-Annex-C' : 'cadmv-ios',
      responseMode: responseModeParam || 'dc_api',
      clientIdScheme: clientIdSchemeParam,
      signed: true
    };
  }

  if(resolvedProfile === 'apple-wallet') {
    return {
      profile: 'apple-wallet',
      responseMode: responseModeParam || 'dc_api',
      clientIdScheme: clientIdSchemeParam,
      signed: true
    };
  }
  if(resolvedProfile === 'google-wallet') {
    return {
      profile: 'google-wallet',
      responseMode: responseModeParam || 'dc_api.jwt',
      clientIdScheme: clientIdSchemeParam || 'x509_hash',
      signed: true
    };
  }

  // Step 4: Determine response mode based on profile and parameter
  let responseMode = 'direct_post';

  if(resolvedProfile === '18013-7-Annex-B') {
    responseMode = 'direct_post';
  } else if(resolvedProfile === '18013-7-Annex-D-spruceid' ||
    resolvedProfile === '18013-7-Annex-C-spruceid') {
    responseMode = responseModeParam || 'dc_api';
  } else if(resolvedProfile === 'OID4VP-HAIP-1.0') {
    responseMode = responseModeParam || 'dc_api.jwt';
  } else if(responseModeParam === 'dc_api' ||
    responseModeParam === 'dc_api.jwt') {
    responseMode = responseModeParam;
  }

  const signed = resolvedProfile === '18013-7-Annex-B' ||
    resolvedProfile === 'OID4VP-HAIP-1.0';

  return {
    profile: resolvedProfile,
    responseMode,
    clientIdScheme: clientIdSchemeParam || 'did',
    signed
  };
}
