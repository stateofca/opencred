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
  const step = exchange.step ?? 'default';
  const id = `${config.server.baseUri}/workflows/${exchange.workflowId}` +
    `/exchanges/${exchange.id}`;
  let payload;
  if(!callback.body) {
    // Legacy behavior: forward the full set of exchange variables.
    payload = {id, variables: exchange.variables, step};
  } else {
    // Curated body: forward only the explicitly requested exchange variables
    // and presentation artifacts.
    const {body} = callback;
    const variables = {};
    for(const v of body.variables ?? []) {
      if(exchange.variables && v in exchange.variables) {
        variables[v] = exchange.variables[v];
      }
    }
    payload = {id, variables, step};
    const result = exchange.variables?.results?.[step];
    const vp = result?.verifiablePresentation;
    if(body.vpToken && result?.vpToken !== undefined) {
      payload.vpToken = result.vpToken;
    }
    if(body.verifiablePresentation && vp !== undefined) {
      payload.verifiablePresentation = vp;
    }
    if(body.verifiableCredential && vp?.verifiableCredential !== undefined) {
      payload.verifiableCredential = vp.verifiableCredential;
    }
  }

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
    // Store the whole callback response under a single top-level exchange
    // variable so it survives partial-scope scrubbing and can be surfaced on
    // the success view. No storage when the callback returns no body.
    if(data !== undefined && data !== null && data !== '') {
      exchange.variables = exchange.variables ?? {};
      exchange.variables.callbackResponse = data;
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
