import base64url from 'base64url';
import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {database} from '../database.js';
import {domainToDidWeb} from '../didWeb.js';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';
import {logger} from '../logger.js';
// use an agent to avoid self-signed certificate errors
const agent = new https.Agent({rejectUnauthorized: false});

export class BaseWorkflowService {
  constructor(app) {
    if(app) {
      app.get(
        '/context/login',
        this.getOrCreateExchange.bind(this)
      );
      app.get(
        '/context/verification',
        this.getOrCreateExchange.bind(this)
      );
      app.post(
        '/workflows/:workflowId/exchanges',
        this.createExchange.bind(this)
      );
      app.get(
        '/workflows/:workflowId/exchanges/:exchangeId',
        this.getStatus.bind(this)
      );
    }
  }

  async createWorkflowSpecificExchange() {
    throw new Error(
      'Not implemented: createWorkflowSpecificExchange must be implemented ' +
      'in a workflow implementation.');
  }

  async createExchange(req, res, next) {
    const accessToken = await createId();
    const oidc = {
      code: null,
      state: req.query?.state ?? req.body?.oidcState ?? ''
    };

    let untrustedVariables = {};
    if(req.query?.variables || req.body?.variables) {
      untrustedVariables = JSON.parse(
        base64url.decode(req.query?.variables ?? req.body?.variables)
      );
    }
    try {
      const exchange = await this.createWorkflowSpecificExchange(
        {rp: req.rp, accessToken, oidc},
        untrustedVariables
      );
      if(exchange) {
        req.exchange = exchange;
      }
      next();
    } catch(e) {
      logger.error(e);
      res.status(500).send({message: 'Internal Server Error'});
    }
  }

  async getStatus(req, res, next) {
    const rp = req.rp;
    if(!rp?.workflow) {
      next();
      return;
    }
    if(!req.exchange) {
      req.exchange = await this.getExchange({
        id: req.params.exchangeId,
        allowExpired: true
      });
    }
    next();
  }

  async getOrCreateExchange(req, res, next) {
    const {exchangeId, accessToken} = req.cookies;
    if(!(exchangeId && accessToken)) {
      return this.createExchange(req, res, next);
    }
    const exchange = await this.getExchange({
      id: exchangeId,
      accessToken
    });
    if(exchange) {
      req.exchange = this.formatExchange(exchange);
    }
    next();
  }

  async getExchange(
    {id, accessToken, allowExpired} = {allowExpired: false}
  ) {
    const exchange = await database.collections.Exchanges.findOne({
      ...(id ? {id} : {}),
      ...(accessToken ? {accessToken} : {})
    }, {projection: {_id: 0}});
    if(!exchange) {
      return null;
    }
    const expiry = new Date(exchange.createdAt.getTime() + exchange.ttl * 1000);
    if(!allowExpired && new Date() > expiry) {
      return null;
    }
    return exchange;
  }

  formatExchange(exchange) {
    if(!exchange) {
      return null;
    }
    const id = exchange.id;
    const accessToken = exchange.accessToken;
    const oidc = exchange.oidc;
    const domain = config.server.baseUri;
    const workflowId = exchange.workflowId;
    const vcapi = `${domain}/workflows/${workflowId}/exchanges/${id}`;
    const authzReqUrl = `${vcapi}/openid/client/authorization/request`;
    const searchParams = new URLSearchParams({
      client_id: domainToDidWeb(config.server.baseUri),
      request_uri: authzReqUrl
    });
    const OID4VP = exchange.OID4VP ?? 'openid4vp://?' + searchParams.toString();
    return {id, vcapi, OID4VP, accessToken, oidc, workflowId};
  }

  parseUntrustedVariables(untrustedVariableAllowList, untrustedVariables) {
    const variables = {};
    if(!untrustedVariables) {
      return variables;
    }
    for(const v of untrustedVariableAllowList) {
      if(v in untrustedVariables) {
        variables[v] = untrustedVariables[v];
      }
    }
    return variables;
  }

  async sendCallback(workflow, exchange, stepName) {
    const {callback} = workflow.steps[stepName];
    if(!callback) {
      return true;
    }
    const payload = {
      id: `${config.server.baseUri}/workflows/${exchange.workflowId}` +
          `/exchanges/${exchange.id}`,
      // variables: exchange.variables,
      step: stepName
    };
    console.log(JSON.stringify(exchange.variables, null, 2))
    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('client_id', callback.oauth.clientId);
    body.set('client_secret', callback.oauth.clientSecret);
    body.set('scope', callback.oauth.scope);
    try {
      const {data: authData} = await httpClient.post(
        callback.oauth.tokenUrl,
        {
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body
        }
      );
      await httpClient.post(callback.url, {
        agent,
        headers: {
          dmv_source: 'OpenCred',
          dmv_appid: 'OpenCred',
          'X-Correlation-ID': 'UUID',
          Authorization: `Bearer ${authData.access_token}`
        },
        json: payload
      });
    } catch(e) {
      logger.error(JSON.stringify(e, null, 2));
      logger.error(`${e.name}: ${e.requestUrl} - Status ${e.status}`);
      return false;
    }
    return true;
  }
}
