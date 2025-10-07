import base64url from 'base64url';
import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {database} from '../database.js';
import {domainToDidWeb} from '../didWeb.js';
import {logger} from '../logger.js';

export class BaseWorkflowService {
  constructor(app) {
    if(app) {
      app.get('/context/login', this.getOrCreateExchange.bind(this));
      app.get('/context/verification', this.getOrCreateExchange.bind(this));
      app.post(
        '/workflows/:workflowId/exchanges',
        this.createExchange.bind(this),
      );
      app.get(
        '/workflows/:workflowId/exchanges/:exchangeId',
        this.getStatus.bind(this),
      );
      app.post(
        '/workflows/:workflowId/exchanges/:exchangeId/reset',
        this.resetExchange.bind(this),
      );
    }
  }

  // eslint-disable-next-line no-unused-vars
  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    // eslint-disable-next-line no-unused-vars
    const {rp, accessToken, oidc} = trustedVariables;
    throw new Error(
      'Not implemented: createWorkflowSpecificExchange must be implemented ' +
        'in a workflow implementation.',
    );
  }

  async resetExchange(req, res) {
    const {exchange} = req;

    const updatedExchange = {
      ...exchange,
      state: 'pending',
      step: req.rp.workflow.initialStep,
      createdAt: new Date(),
      variables: {
        ...exchange.variables,
        results: {},
        authorizationRequest: null,
      },
    };
    await database.collections.Exchanges.replaceOne(
      {id: exchange.id},
      updatedExchange,
      {upsert: false},
    );
    res.send(this.formatExchange(updatedExchange));
  }

  async initExchange(trustedVariables, untrustedVariables) {
    const {rp, accessToken, oidc} = trustedVariables;
    const duration = config.opencred.options.recordExpiresDurationMs;
    const ttl =
      trustedVariables.ttl ?? config.opencred.options.exchangeTtlSeconds;
    const gracePeriod = 60000; // 1 minute

    let variables = {};
    if(untrustedVariables && rp.workflow.untrustedVariableAllowList) {
      variables = this.parseUntrustedVariables(
        rp.workflow.untrustedVariableAllowList,
        untrustedVariables,
      );
    }

    const createdAt = new Date();

    return {
      id: await createId(),
      challenge: await createId(),
      workflowId: rp.workflow.id,
      state: 'pending',
      sequence: 0,
      step: rp.workflow.initialStep, // Might be undefined for vc-api
      ttl,
      createdAt,
      recordExpiresAt: new Date(
        createdAt.getTime() + Math.max(ttl * 1000 + gracePeriod, duration),
      ),
      variables,
      oidc,
      accessToken,
    };
  }

  async createExchange(req, res, next) {
    const accessToken = await createId();
    const oidc = {
      code: null,
      state: req.query?.state ?? req.body?.oidcState ?? '',
    };

    let untrustedVariables = {};
    if(req.query?.variables || req.body?.variables) {
      try {
        untrustedVariables = JSON.parse(
          base64url.decode(req.query?.variables ?? req.body?.variables),
        );
      } catch(e) {
        res.status(400).send({
          message: 'Invalid variables supplied while creating exchange.',
        });
        return;
      }
    }
    try {
      const exchange = await this.createWorkflowSpecificExchange(
        {rp: req.rp, accessToken, oidc},
        untrustedVariables,
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
        rp,
        id: req.params.exchangeId,
        allowExpired: true,
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
      rp: req.rp,
      id: exchangeId,
      accessToken,
    });
    if(exchange) {
      req.exchange = this.formatExchange(exchange);
    }
    next();
  }

  async getExchange(
    {rp, id, accessToken, allowExpired} = {allowExpired: false},
  ) {
    const exchange = await database.collections.Exchanges.findOne(
      {
        ...(id ? {id} : {}),
        ...(accessToken ? {accessToken} : {}),
      },
      {projection: {_id: 0}},
    );
    if(!exchange || !rp) {
      return null;
    }

    const expiry = new Date(exchange.createdAt.getTime() + exchange.ttl * 1000);
    if(!allowExpired && new Date() > expiry) {
      return null;
    }

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
      request_uri: authzReqUrl,
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
