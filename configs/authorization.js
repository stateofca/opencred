/*!
 * Copyright 2024 - 2026 California Department of Motor Vehicles
 * Copyright 2024 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

const getOAuthConfigs = workflow => {
  const configs = [];

  const {oauth} = workflow.callback ?? {};
  if(oauth) {
    configs.push({
      issuer: oauth.issuer,
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      token_endpoint: oauth.tokenUrl,
      scope: oauth.scope,
      pkce: false,
      protocol: 'oauth2_client_grant',
      grant_type: 'client_credentials'
    });
  }

  return configs;
};

/**
 * Derive OAuth client authorization entries from workflow callback config.
 * Used by `lib/callback.js` to refresh access tokens for callback delivery.
 *
 * @param {object} options - Options object.
 * @param {Array} options.workflows - Resolved workflow configurations.
 * @returns {Array} - Authorization entries, one per `callback.oauth` block.
 */
export const buildAuthorizationConfig = ({workflows}) =>
  workflows.flatMap(workflow => getOAuthConfigs(workflow));
