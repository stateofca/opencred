/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Registered OIDC redirect URIs for a workflow.
 *
 * @param {object} options - Options.
 * @param {object} [options.workflow] - Workflow with optional oidc.redirectUri.
 * @returns {Array<string>} Redirect URI whitelist (may be empty).
 */
export function getRegisteredRedirectUris({workflow} = {}) {
  const uris = workflow?.oidc?.redirectUri;
  if(Array.isArray(uris)) {
    return uris;
  }
  if(typeof uris === 'string' && uris) {
    return [uris];
  }
  return [];
}

/**
 * Whether redirectUri is on the workflow whitelist.
 *
 * @param {object} options - Options.
 * @param {object} options.workflow - Workflow configuration.
 * @param {string} options.redirectUri - Requested redirect URI.
 * @returns {boolean} True when registered.
 */
export function isAllowedRedirectUri({workflow, redirectUri}) {
  if(!redirectUri || typeof redirectUri !== 'string') {
    return false;
  }
  return getRegisteredRedirectUris({workflow}).includes(redirectUri);
}

/**
 * Redirect URI for frontend context / RP redirect (exchange-bound).
 *
 * @param {object} options - Options.
 * @param {object} options.workflow - Workflow configuration.
 * @param {object} [options.exchange] - Exchange with optional oidc.redirectUri.
 * @returns {string|undefined} Resolved redirect URI.
 */
export function resolveContextRedirectUri({workflow, exchange}) {
  const bound = exchange?.oidc?.redirectUri;
  if(bound && isAllowedRedirectUri({workflow, redirectUri: bound})) {
    return bound;
  }
  const registered = getRegisteredRedirectUris({workflow});
  if(registered.length === 1) {
    return registered[0];
  }
  return undefined;
}
