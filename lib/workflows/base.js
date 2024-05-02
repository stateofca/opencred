import base64url from 'base64url';
import {config} from '@bedrock/core';
import {database} from '../database.js';
import {domainToDidWeb} from '../didWeb.js';

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

  async createExchange() {
    throw new Error('Not implemented: createExchange must be implemented\
      in concrete implementation.');
  }

  async getStatus(req, res, next) {
    const rp = req.rp;
    if(!rp || !rp.workflow) {
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

  parseUntrustedVariables(untrustedVariableAllowList, variablesParam) {
    const variables = {};
    if(!variablesParam) {
      return variables;
    }
    const decodedVariables = JSON.parse(base64url.decode(variablesParam));
    for(const v of untrustedVariableAllowList) {
      if(v in decodedVariables) {
        variables[v] = decodedVariables[v];
      }
    }
    return variables;
  }
}
