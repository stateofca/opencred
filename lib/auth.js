/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseWorkflowService} from './workflows/base.js';
import {config} from '@bedrock/core';

/**
 * Factory function that creates authentication middleware.
 *
 * @param {object} options - Authentication options.
 * @param {boolean} options.basic - Allow Basic authentication.
 * @param {boolean} options.bearer - Allow Bearer token authentication.
 * @param {boolean} options.body - Allow authentication via request body.
 * @returns {Function} Express middleware function.
 */
export const getAuthFunction = ({basic, bearer, body}) => {
  const ensureAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const parts = authHeader?.split(' ') ?? [];
    if(body && !req.workflow) {
      const body_id = req.body?.client_id;
      const body_secret = req.body?.client_secret;

      if(body_id && body_secret) {
        req.workflow = config.opencred.workflows.find(
          r => r.clientId == body_id && r.clientSecret == body_secret
        );
        if(req.workflow) {
          next();
          return;
        }
      }
    }

    if(basic && !req.workflow && parts.length > 0) {
      const val = Buffer.from(parts[1], 'base64').toString('utf-8');
      const authValueParts = val.split(':');
      if(
        authValueParts.length !== 2
      ) {
        res.status(401).send(
          {message: 'Malformed Authorization header'}
        );
        return;
      }
      const clientId = authValueParts[0];
      const clientSecret = authValueParts[1];
      req.workflow = config.opencred.workflows.find(
        r => r.clientId == clientId && r.clientSecret == clientSecret
      );
      if(req.workflow) {
        next();
        return;
      }
    }

    if(!req.workflow) {
      res.status(401).send(
        {message: 'Client ID could not be resolved from request.'}
      );
      return;
    }
    const clientId = req.workflow.clientId;
    const clientSecret = req.workflow.clientSecret;

    if(!body && !req.headers.authorization) {
      res.status(401).send({message: 'Authorization header is required'});
      return;
    }

    if(!body && parts.length !== 2) {
      res.status(401).send(
        {message: 'Invalid Authorization format. Basic or Bearer required'}
      );
      return;
    } else if(basic && parts[0] == 'Basic') {
      const val = Buffer.from(parts[1], 'base64').toString('utf-8');
      const authValueParts = val.split(':');
      if(
        authValueParts.length !== 2 ||
        authValueParts[0] !== clientId ||
        authValueParts[1] !== clientSecret
      ) {
        res.status(401).send(
          {message: 'Malformed token or invalid clientId or clientSecret'}
        );
        return;
      }
    } else if(bearer && parts[0] == 'Bearer') {
      const exchange = await new BaseWorkflowService().getExchange({
        workflow: req.workflow,
        ...(req.params.exchangeId ? {id: req.params?.exchangeId} : {}),
        accessToken: parts[1],
        allowExpired: true
      });
      if(!exchange) {
        res.status(404).send({message: 'Exchange not found'});
        return;
      }
      req.exchange = exchange;
      if(exchange.workflowId !== req.workflow.clientId) {
        res.status(401).send({message: 'Invalid token'});
        return;
      }
    } else if(body) {
      if(
        req.body.client_id !== clientId ||
        req.body.client_secret !== clientSecret
      ) {
        res.status(401).send(
          {message: 'Malformed token or invalid clientId or clientSecret'}
        );
        return;
      }
    } else {
      res.status(401).send(
        {message: 'Invalid Authorization header format. Basic auth required'}
      );
      return;
    }

    next();
  };
  return ensureAuth;
};
