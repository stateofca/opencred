import {config} from '@bedrock/core';
import {getAccessToken} from '@bedrock/oauth2-client';
import {httpClient} from '@digitalbazaar/http-client';
import {logger} from './logger.js';

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

export async function sendCallback(workflow, exchange, stepName) {
  if(!workflow.steps || !workflow.steps[stepName]) {
    logger.error(`step ${stepName} not found in workflow`);
    return false;
  }
  const {callback} = workflow.steps[stepName];
  if(!callback) {
    return true;
  }
  const payload = {
    id: `${config.server.baseUri}/workflows/${exchange.workflowId}` +
        `/exchanges/${exchange.id}`,
    variables: exchange.variables,
    step: stepName
  };

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
    logger.info(`Sending callback to ${callback.url}`);
    logger.debug('Callback payload', {payload});
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
  return true;
}
