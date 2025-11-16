import base64url from 'base64url';
import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {database} from '../database.js';
import {domainToDidWeb} from '../didWeb.js';
import {logger} from '../logger.js';

export class BaseWorkflowService {
  // eslint-disable-next-line no-unused-vars
  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    // eslint-disable-next-line no-unused-vars
    const {rp, accessToken, oidc} = trustedVariables;
    throw new Error(
      'Not implemented: createWorkflowSpecificExchange must be implemented ' +
      'in a workflow implementation.');
  }

  async resetExchangeMiddleware(req, res) {
    if(!req.exchange) {
      res.status(404).send({message: 'Exchange not found'});
      return;
    }
    const {exchange} = req;

    const updatedExchange = {
      ...exchange,
      state: 'pending',
      step: 'default',
      createdAt: new Date(),
      variables: {
        ...exchange.variables,
        results: {},
        authorizationRequest: null,
      }
    };
    await database.collections.Exchanges.replaceOne(
      {id: exchange.id},
      updatedExchange,
      {upsert: false}
    );
    res.send(this.formatExchange(updatedExchange));
  }

  async initExchange(trustedVariables, untrustedVariables) {
    const {rp, accessToken, oidc} = trustedVariables;
    const duration = config.opencred.options.recordExpiresDurationMs;
    const ttl = trustedVariables.ttl ??
      config.opencred.options.exchangeTtlSeconds;
    const gracePeriod = 60000; // 1 minute

    let variables = {};
    if(untrustedVariables && rp.untrustedVariableAllowList) {
      variables = this.parseUntrustedVariables(
        rp.untrustedVariableAllowList,
        untrustedVariables
      );
    }

    const createdAt = new Date();

    return {
      id: await createId(),
      challenge: await createId(),
      workflowId: rp.clientId,
      state: 'pending',
      sequence: 0,
      step: 'default',
      ttl,
      createdAt,
      recordExpiresAt: new Date(
        createdAt.getTime() + Math.max(ttl * 1000 + gracePeriod, duration)),
      variables,
      oidc,
      accessToken
    };
  }

  async createExchangeMiddleware(req, res, next) {
    const accessToken = await createId();
    const oidc = {
      code: null,
      state: req.query?.state ?? req.body?.oidcState ?? ''
    };

    let untrustedVariables = {};
    if(req.query?.variables || req.body?.variables) {
      try {
        untrustedVariables = JSON.parse(
          base64url.decode(req.query?.variables ?? req.body?.variables)
        );
      } catch(e) {
        res.status(400).send({
          message: 'Invalid variables supplied while creating exchange.'
        });
        return;
      }
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
      try {
        if(process.env.DEBUG_ERRORS === 'true') {
          const errorResponse = {
            message: e.message || 'Internal Server Error',
            ...(e.stack ? {stack: e.stack} : {})
          };
          res.status(500).send(errorResponse);
        } else {
          res.status(500).send({message: 'Internal Server Error'});
        }
      } catch(serializationError) {
        res.status(500).send({
          message: 'Internal Server Error',
          debug: 'Error occurred while serializing error response'
        });
      }
    }
  }

  createGetExchangeMiddleware({allowExpired = true} = {}) {
    return async (req, res, next) => {
      const rp = req.rp;
      if(!req.exchange) {
        req.exchange = await this.getExchange({
          rp,
          id: req.params.exchangeId,
          allowExpired
        });
      }
      next();
    };
  }

  async getExchangeMiddleware(req, res, next) {
    const rp = req.rp;
    if(!req.exchange) {
      req.exchange = await this.getExchange({
        rp,
        id: req.params.exchangeId,
        allowExpired: true
      });
    }
    next();
  }

  async getOrCreateExchangeMiddleware(req, res, next) {
    const {exchangeId, accessToken} = req.cookies;
    if(!(exchangeId && accessToken)) {
      return this.createExchangeMiddleware(req, res, next);
    }
    const exchange = await this.getExchange({
      rp: req.rp,
      id: exchangeId,
      accessToken
    });
    if(exchange) {
      req.exchange = this.formatExchange(exchange);
    }
    next();
  }

  async getExchange(
    {rp, id, accessToken, allowExpired} = {allowExpired: false}
  ) {
    const exchange = await database.collections.Exchanges.findOne({
      ...(id ? {id} : {}),
      ...(accessToken ? {accessToken} : {})
    }, {projection: {_id: 0}});
    if(!exchange || !rp) {
      return null;
    }

    // Ensure createdAt is a Date object (handle Date objects and ISO strings)
    const createdAt = exchange.createdAt instanceof Date ?
      exchange.createdAt : new Date(exchange.createdAt);
    // Check if createdAt is valid
    if(isNaN(createdAt.getTime())) {
      // Invalid date, treat as expired if not allowed
      if(!allowExpired) {
        return null;
      }
      return exchange;
    }
    // Check expiration only if ttl exists and is valid
    const ttl = exchange.ttl;
    if(ttl != null && typeof ttl === 'number' && !isNaN(ttl)) {
      const expiry = new Date(createdAt.getTime() + ttl * 1000);
      if(!allowExpired && new Date() > expiry) {
        return null;
      }
    }
    // If ttl is missing or invalid, we can't determine expiration,
    // so allow the exchange through

    // Necessary for hiding secret access token
    // from frontend for Entra relying parties
    // eslint-disable-next-line no-unused-vars
    const {apiAccessToken, ...exchangeData} = exchange;

    return exchangeData;
  }

  formatExchange(exchange) {
    if(!exchange) {
      return null;
    }
    const {id, accessToken, oidc, workflowId, ttl, createdAt} = exchange;
    const domain = config.server.baseUri;
    const vcapi = `${domain}/workflows/${workflowId}/exchanges/${id}`;
    const authzReqUrl = `${vcapi}/openid/client/authorization/request`;
    const searchParams = new URLSearchParams({
      client_id: domainToDidWeb(config.server.baseUri),
      request_uri: authzReqUrl
    });
    const OID4VP = exchange.OID4VP ?? 'openid4vp://?' + searchParams.toString();
    return {id, vcapi, OID4VP, accessToken, oidc, ttl, createdAt, workflowId};
  }

  /**
   * Stores variables in an exchange if they are on the allow list
   * @param {Array<string>} untrustedVariableAllowList
   * @param {Object<string, any>} untrustedVariables
   * @returns
   */
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
}
