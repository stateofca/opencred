/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
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
 * Helper function to create an exchange with authorization request.
 *
 * @param {object} options - Options for exchange creation.
 * @param {object} options.workflow - Workflow configuration.
 * @param {object} options.trustedVariables - Trusted variables for
 *   exchange creation.
 * @param {object} options.untrustedVariables - Untrusted variables for
 *   exchange creation.
 * @param {string} options.profile - OID4VP profile identifier.
 * @param {string} options.responseMode - Response mode for authorization
 *   request.
 * @returns {Promise<object>} Exchange object with authorization request.
 */
export async function createExchangeWithAuthRequest({
  workflow,
  trustedVariables,
  untrustedVariables = {},
  profile,
  responseMode
} = {}) {
  // Create exchange using initExchange to get full exchange object
  const accessToken = trustedVariables?.accessToken || await createId();
  const oidc = trustedVariables?.oidc || {code: null, state: 'test'};

  const exchange = await service.initExchange(
    {workflow, accessToken, oidc},
    untrustedVariables
  );

  // Generate authorization request
  const domain = workflow.domain || config.server.baseUri;
  const url = `/workflows/${workflow.clientId}/exchanges/` +
    `${exchange.id}/openid/client/authorization/request`;
  const authorizationRequest = await getAuthorizationRequest({
    workflow,
    exchange,
    domain,
    url,
    profile,
    responseMode
  });

  // Add authorization request to exchange variables
  exchange.variables = exchange.variables || {};
  exchange.variables.authorizationRequest = authorizationRequest;

  return exchange;
}

