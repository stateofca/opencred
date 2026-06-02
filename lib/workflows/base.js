import base64url from 'base64url';
import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {database} from '../database.js';
import {findWorkflow} from '../resolveClient.js';
import {isAllowedRedirectUri} from '../redirect-uri.js';
import {logger} from '../logger.js';
import QRCode from 'qrcode';

const RECORD_EXPIRES_GRACE_MS = 60000; // 1 minute

/**
 * Format an exchange expiry as an ISO 8601 dateTimeStamp with Z suffix.
 *
 * @param {Date|string} date - Expiry instant.
 * @returns {string|null} ISO string or null when invalid.
 */
export function formatExchangeExpires(date) {
  const d = date instanceof Date ? date : new Date(date);
  if(Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toISOString();
}

/**
 * Resolve when an exchange expires based on the document.
 *
 * @param {object} options - Options hashmap.
 * @param {object} [options.exchange] - Exchange document.
 * @returns {Date|null} Expiry instant or null when unknown.
 */
export function resolveExchangeExpires({exchange} = {}) {
  if(!exchange) {
    return null;
  }
  const {expires} = exchange;
  if(expires != null) {
    const expiresDate = expires instanceof Date ?
      expires : new Date(expires);
    if(!Number.isNaN(expiresDate.getTime())) {
      return expiresDate;
    }
  }
  return null;
}

/**
 * Seconds until an expiry instant, server-time based.
 *
 * @param {object} options - Options hashmap.
 * @param {Date|string} options.expires - Expiry instant.
 * @param {Date|number} [options.now] - Clock override (for tests).
 * @returns {number|null} Remaining seconds (>= 0) or null when invalid.
 */
export function getSecondsUntilExpires({expires, now} = {}) {
  if(expires == null) {
    return null;
  }
  const expiresDate = expires instanceof Date ?
    expires : new Date(expires);
  if(Number.isNaN(expiresDate.getTime())) {
    return null;
  }
  const nowMs = now instanceof Date ? now.getTime() :
    (now ?? Date.now());
  return Math.max(0, Math.ceil((expiresDate.getTime() - nowMs) / 1000));
}

/**
 * Compute the seconds remaining in an exchange's TTL, server-time based.
 * Returns null when expiry cannot be resolved.
 *
 * @param {object} options - Options hashmap.
 * @param {object} [options.exchange] - Exchange document.
 * @param {Date|string} [options.createdAt] - Legacy: creation time.
 * @param {number} [options.ttl] - Legacy: TTL in seconds.
 * @param {Date|number} [options.now] - Clock override (for tests).
 * @returns {number|null} Remaining seconds, clamped to >= 0, or null
 *   when inputs are missing/invalid.
 */
export function getExchangeTtlRemaining({
  exchange, createdAt, ttl, now
} = {}) {
  const resolvedExpires = exchange ?
    resolveExchangeExpires({exchange}) :
    (createdAt != null && ttl != null ?
      resolveExchangeExpires({exchange: {createdAt, ttl}}) : null);
  if(!resolvedExpires) {
    return null;
  }
  return getSecondsUntilExpires({expires: resolvedExpires, now});
}

/**
 * Compute fresh `expires` / `recordExpiresAt` values that reset an
 * exchange's TTL without mutating `createdAt`. Uses the same record TTL
 * formula as `BaseWorkflowService.initExchange`.
 *
 * @param {object} options - Options hashmap.
 * @param {object} [options.exchange] - The exchange being refreshed
 *   (used only to read `ttl` when not supplied).
 * @param {number} [options.ttl] - Override TTL in seconds. Falls back
 *   to `exchange.ttl`, then to
 *   `config.opencred.options.exchangeTtlSeconds`.
 * @param {Date} [options.now] - Injected clock (for tests). Defaults to
 *   `new Date()` when omitted.
 * @returns {{expires: Date, recordExpiresAt: Date}} Refreshed
 *   timestamps.
 */
export function refreshExchangeExpiryFields({exchange, ttl, now} = {}) {
  const ttlSeconds = ttl ?? exchange?.ttl ??
    config.opencred.options.exchangeTtlSeconds;
  const duration = config.opencred.options.recordExpiresDurationMs;
  const anchor = now ?? new Date();
  const expires = new Date(anchor.getTime() + ttlSeconds * 1000);
  return {
    expires,
    ttl: ttlSeconds,
    recordExpiresAt: new Date(
      anchor.getTime() +
      Math.max(ttlSeconds * 1000 + RECORD_EXPIRES_GRACE_MS, duration)
    )
  };
}

export class BaseWorkflowService {
  // eslint-disable-next-line no-unused-vars
  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    // eslint-disable-next-line no-unused-vars
    const {workflow, accessToken, oidc} = trustedVariables;
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
      ...refreshExchangeExpiryFields({exchange}),
      variables: {
        ...exchange.variables,
        results: {},
        authorizationRequest: null
      }
    };
    await database.collections.Exchanges.replaceOne(
      {id: exchange.id},
      updatedExchange,
      {upsert: false}
    );
    res.send(await this.formatExchange({
      exchange: updatedExchange,
      workflow: req.workflow
    }));
  }

  async initExchange(trustedVariables, untrustedVariables) {
    const {workflow, accessToken, oidc, procedurePath} = trustedVariables;
    const duration = config.opencred.options.recordExpiresDurationMs;
    const ttl = trustedVariables.ttl ??
      config.opencred.options.exchangeTtlSeconds;

    const variables = {
      procedurePath: procedurePath ?? 'verification'
    };
    if(untrustedVariables && workflow.untrustedVariableAllowList) {
      Object.assign(variables, this.parseUntrustedVariables(
        workflow.untrustedVariableAllowList,
        untrustedVariables
      ));
    }

    const createdAt = new Date();
    const expires = new Date(createdAt.getTime() + ttl * 1000);

    return {
      id: await createId(),
      challenge: await createId(),
      workflowId: workflow.clientId,
      state: 'pending',
      sequence: 0,
      step: 'default',
      ttl,
      createdAt,
      expires,
      recordExpiresAt: new Date(
        createdAt.getTime() +
        Math.max(ttl * 1000 + RECORD_EXPIRES_GRACE_MS, duration)),
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

    const requestedRedirectUri = req.query?.redirect_uri;
    if(requestedRedirectUri) {
      if(!isAllowedRedirectUri({
        workflow: req.workflow,
        redirectUri: requestedRedirectUri
      })) {
        res.status(400).send({
          error: 'invalid_grant',
          error_description: 'Unknown redirect_uri'
        });
        return;
      }
      oidc.redirectUri = requestedRedirectUri;
    }

    let untrustedVariables = {};
    if(req.query?.variables || req.body?.variables) {
      try {
        untrustedVariables = JSON.parse(
          base64url.decode(req.query?.variables ?? req.body?.variables)
        );
      } catch {
        res.status(400).send({
          message: 'Invalid variables supplied while creating exchange.'
        });
        return;
      }
    }
    const procedurePath = req.procedurePath ?? 'verification';
    try {
      const exchange = await this.createWorkflowSpecificExchange(
        {workflow: req.workflow, accessToken, oidc, procedurePath},
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
      } catch {
        res.status(500).send({
          message: 'Internal Server Error',
          debug: 'Error occurred while serializing error response'
        });
      }
    }
  }

  createGetExchangeMiddleware({allowExpired = true} = {}) {
    return async (req, res, next) => {
      if(!req.exchange) {
        req.exchange = await this.getExchange({
          id: req.params.exchangeId,
          allowExpired
        });
      }
      if(!req.exchange) {
        res.status(404).send({message: 'Exchange not found'});
        return;
      }
      if(!req.workflow) {
        req.workflow = findWorkflow(
          config.opencred.workflows ?? [], req.exchange.workflowId
        );
      }
      next();
    };
  }

  async getExchangeMiddleware(req, res, next) {
    if(!req.exchange) {
      req.exchange = await this.getExchange({
        id: req.params.exchangeId,
        allowExpired: true
      });
    }
    if(!req.exchange) {
      res.status(404).send({message: 'Exchange not found'});
      return;
    }
    if(!req.workflow) {
      req.workflow = findWorkflow(
        config.opencred.workflows ?? [], req.exchange.workflowId
      );
      if(req.params.workflowId && req.workflow) {
        // Verify the URL param resolves to the same workflow as the exchange
        const urlWorkflow = findWorkflow(
          config.opencred.workflows ?? [], req.params.workflowId
        );
        if(!urlWorkflow || urlWorkflow.clientId !== req.workflow.clientId) {
          res.status(404).send({message: `Exchange not found for workflow ${
            req.params.workflowId}`});
          return;
        }
      }
    }
    next();
  }

  async getOrCreateExchangeMiddleware(req, res, next) {
    const {exchangeId, accessToken} = req.cookies;
    if(!(exchangeId && accessToken)) {
      return this.createExchangeMiddleware(req, res, next);
    }
    const exchange = await this.getExchange({
      id: exchangeId,
      accessToken
    });
    if(!req.workflow) {
      req.workflow = findWorkflow(
        config.opencred.workflows ?? [], exchange.workflowId
      );
    }
    if(exchange) {
      req.exchange = await this.formatExchange({
        exchange,
        workflow: req.workflow
      });
    }
    next();
  }

  async getExchange({
    id, accessToken, allowExpired = false
  } = {}) {
    const exchange = await database.collections.Exchanges.findOne({
      ...(id ? {id} : {}),
      ...(accessToken ? {accessToken} : {})
    }, {projection: {_id: 0}});
    if(!exchange) {
      return null;
    }

    const expires = resolveExchangeExpires({exchange});
    if(expires && !allowExpired && Date.now() > expires.getTime()) {
      return null;
    }

    // Necessary for hiding secret access token
    // from frontend for Entra relying parties
    // eslint-disable-next-line no-unused-vars
    const {apiAccessToken, ...exchangeData} = exchange;

    return exchangeData;
  }

  async formatExchange({exchange, includeQR = false, workflow} = {}) {
    if(!exchange) {
      return null;
    }
    const {id, accessToken, oidc, workflowId, ttl, createdAt, state} = exchange;
    const domain = config.server.baseUri;
    const vcapi = `${domain}/workflows/${workflowId}/exchanges/${id}`;

    // Generate protocols object
    const protocols = this.getProtocols({exchange, workflow});

    const result = {
      id,
      vcapi,
      OID4VP: protocols.OID4VP,
      accessToken,
      oidc,
      ttl,
      createdAt,
      expires: formatExchangeExpires(resolveExchangeExpires({exchange})),
      workflowId,
      state,
      protocols
    };

    // Generate QR code if requested
    if(includeQR && protocols.OID4VP) {
      result.QR = await QRCode.toDataURL(protocols.OID4VP);
    }

    return result;
  }

  /**
   * Returns the protocols object for an exchange.
   * Override this method in subclasses to provide protocol-specific URLs.
   * The base implementation adds the interact URL. Subclasses should call
   * super.getProtocols() and merge their protocols with the result.
   *
   * @param {object} options - Options object.
   * @param {object} options.exchange - The exchange object.
   * @returns {object} - Protocols object.
   */

  getProtocols({exchange} = {}) {
    if(!exchange) {
      return {};
    }
    const domain = config.server.baseUri;
    const {id} = exchange;
    return {
      interact: `${domain}/interactions/${id}?iuv=1`
    };
  }

  /**
   * Stores variables in an exchange if they are on the allow list.
   *
   * @param {Array<string>} untrustedVariableAllowList - List of allowed
   *   variable names.
   * @param {{[key: string]: any}} untrustedVariables - Object containing
   *  untrusted variables.
   * @returns {{[key: string]: any}} - Object containing filtered
   *   variables from the allow list.
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
