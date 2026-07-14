/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';
import {getAccessToken} from '@bedrock/oauth2-client';
import {httpClient} from '@digitalbazaar/http-client';
import {logger} from './logger.js';
import {logUtils} from '../common/utils.js';

async function refreshAccessToken(issuer) {
  const conf = (config.opencred.authorization ?? [])
    .find(a => a.issuer === issuer);
  if(!conf) {
    throw new Error(
      `No authorization config found for callback oauth issuer '${issuer}'`);
  }
  const {client_id, client_secret, token_endpoint, grant_type, scope} = conf;
  return getAccessToken({
    client_id,
    client_secret,
    token_endpoint,
    grant_type,
    scope,
    audience: 'OpenCred',
    maxRetries: 1
  });
}

export async function sendCallback(workflow, exchange, {userAgent} = {}) {
  const {callback} = workflow;
  if(!callback) {
    return true;
  }
  // Opt in callback data minimization: Forward only the exchange vars in
  // callback.variableAllowList if set, otherwise forwards all exchange vars
  let variables = exchange.variables;
  if(exchange.variables && callback.variableAllowList?.length) {
    variables = {};
    for(const v of callback.variableAllowList) {
      if(v in exchange.variables) {
        variables[v] = exchange.variables[v];
      }
    }
  }
  const payload = {
    id: `${config.server.baseUri}/workflows/${exchange.workflowId}` +
        `/exchanges/${exchange.id}`,
    variables,
    step: 'default'
  };

  try {
    let headers = {};
    if(callback.oauth) {
      try {
        const {accessToken} = await refreshAccessToken(callback.oauth.issuer);
        headers.Authorization = `Bearer ${accessToken}`;
      } catch(error) {
        logger.error(
          `Callback OAuth token refresh failed: ` +
          `issuer '${callback.oauth.issuer}' - ${error.name} - ` +
          `status ${error.status ?? 'none'} - ${error.message}`);
        return false;
      }
    }
    if(callback.headersVariable) {
      if(!exchange.variables[callback.headersVariable]) {
        logger.error(
          `Headers not found in exchange variable '${callback.headersVariable}'`
        );
        return false;
      }
      headers = {
        ...headers,
        ...exchange.variables[callback.headersVariable]
      };
    }
    // Merge static headers from callback.headers if set, no op otherwise
    if(callback.headers) {
      headers = {
        ...headers,
        ...callback.headers
      };
    }

    const {data} = await httpClient.post(callback.url, {
      headers,
      json: payload
    });
    // Store the callback response under callback.responseVariable if set
    // Otherwise response is dropped
    if(callback.responseVariable) {
      exchange.variables[callback.responseVariable] = data;
    }
  } catch(error) {
    // distinguish an HTTP error response from a network-level failure
    // (DNS, TLS, connection refused/timeout) where no response arrived
    const errorType = typeof error.status === 'number' ?
      `HTTP ${error.status}` : `no response (${error.name})`;
    logger.error(
      `Callback POST failed: ${errorType} - ` +
      `${error.requestUrl ?? callback.url} - ${error.message}`);
    return false;
  }
  logUtils.callbackSuccess(workflow?.clientId, exchange.id, userAgent);
  return true;
}
