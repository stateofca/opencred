/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseWorkflowService} from './workflows/base.js';
import {config} from '@bedrock/core';

const getAuthFunction = ({basic, bearer, body}) => {
  const ensureAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const parts = authHeader?.split(' ') ?? [];
    if(body && !req.rp) {
      const body_id = req.body?.client_id;
      const body_secret = req.body?.client_secret;

      if(body_id && body_secret) {
        req.rp = config.opencred.relyingParties.find(
          r => r.clientId == body_id && r.clientSecret == body_secret
        );
        if(req.rp) {
          next();
          return;
        }
      }
    }

    if(basic && !req.rp && parts.length > 0) {
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
      req.rp = config.opencred.relyingParties.find(
        r => r.clientId == clientId && r.clientSecret == clientSecret
      );
      if(req.rp) {
        next();
        return;
      }
    }

    if(!req.rp) {
      res.status(401).send(
        {message: 'Client ID could not be resolved from request.'}
      );
      return;
    }
    const clientId = req.rp.clientId;
    const clientSecret = req.rp.clientSecret;

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
        // params: {
        //   ...(req.params.exchangeId ? {} : {}),
        //   accessToken: parts[1]
        // },,
        rp: req.rp,
        ...(req.params.exchangeId ? {id: req.params?.exchangeId} : {}),
        accessToken: parts[1],
        allowExpired: true
      });
      if(!exchange) {
        res.status(404).send({message: 'Exchange not found'});
        return;
      }
      if(exchange.workflowId !== req.rp.workflow.id) {
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

/**
 * Augments the app to verify an authentication header is present for
 * protected routes. The header must contain a valid Authorization header
 * that encodes the client_id and clientSecret with HTTP Basic Auth
 * @param {Express} app - Express app instance
 */
export default function(app) {
  app.post('/workflows/:workflowId/exchanges', getAuthFunction({
    basic: true, bearer: true, body: false
  }));
  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId', getAuthFunction({
      basic: true, bearer: true, body: false
    })
  );
  app.post('/token', getAuthFunction({
    basic: true, bearer: false, body: true
  }));
}
