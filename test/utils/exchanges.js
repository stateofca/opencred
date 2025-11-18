/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {getAuthorizationRequest} from '../../common/oid4vp.js';
import {NativeWorkflowService} from '../../lib/workflows/native-workflow.js';

// Initialize service instance
const service = new NativeWorkflowService();

/**
 * Helper function to create an exchange with authorization request
 * @param {Object} options - Options for exchange creation
 * @param {Object} options.rp - Relying party configuration
 * @param {Object} options.trustedVariables - Trusted variables for
 *   exchange creation
 * @param {Object} options.untrustedVariables - Untrusted variables for
 *   exchange creation
 * @returns {Promise<Object>} Exchange object with authorization request
 */
export async function createExchangeWithAuthRequest({
  rp,
  trustedVariables,
  untrustedVariables = {}
} = {}) {
  // Create exchange using initExchange to get full exchange object
  const accessToken = trustedVariables?.accessToken || await createId();
  const oidc = trustedVariables?.oidc || {code: null, state: 'test'};

  const exchange = await service.initExchange(
    {rp, accessToken, oidc},
    untrustedVariables
  );

  // Generate authorization request
  const domain = rp.domain || config.server.baseUri;
  const url = `/workflows/${rp.clientId}/exchanges/` +
    `${exchange.id}/openid/client/authorization/request`;
  const authorizationRequest = await getAuthorizationRequest({
    rp,
    exchange,
    domain,
    url
  });

  // Add authorization request to exchange variables
  exchange.variables = exchange.variables || {};
  exchange.variables.authorizationRequest = authorizationRequest;

  return exchange;
}

