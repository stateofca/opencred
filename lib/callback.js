import {config} from '@bedrock/core';
import {getAccessToken} from '@bedrock/oauth2-client';
import {httpClient} from '@digitalbazaar/http-client';
import {logger} from './logger.js';
import {logUtils} from '../common/utils.js';

async function refreshAccessToken(issuer) {
  const conf = config.opencred.authorization.find(a => a.issuer === issuer);
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

export async function sendCallback(workflow, exchange) {
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
      const {accessToken} = await refreshAccessToken(callback.oauth.issuer);
      headers.Authorization = `Bearer ${accessToken}`;
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

    await httpClient.post(callback.url, {
      headers,
      json: payload
    });
  } catch(error) {
    logger.error(
      `${error.name}: ${error.requestUrl} - ` +
      `${error.status} Error - ${error.message}`);
    return false;
  }
  logUtils.callbackSuccess(workflow?.clientId, exchange.id);
  return true;
}
