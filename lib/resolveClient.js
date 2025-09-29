/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';

const attachClientByQuery = async (req, res, next) => {
  if(!req.query.client_id) {
    res.status(400).send({message: 'client_id is required'});
    return;
  }
  const rp = config.opencred.relyingParties.find(
    r => r.clientId == req.query.client_id,
  );
  if(!rp) {
    res.status(400).send({message: 'Unknown client_id'});
    return;
  }
  req.rp = rp;
  next();
};

// Middleware to attach client by body parameters (for token endpoint)
const attachClientByBody = async (req, res, next) => {
  const {client_id, client_secret} = req.body;

  if(!client_id) {
    // Skip - let the endpoint handle missing client_id
    next();
    return;
  }

  const rp = config.opencred.relyingParties.find(
    r => r.clientId === client_id,
  );

  if(!rp) {
    res.status(401).send({
      error: 'invalid_client',
      error_description: 'Client not found',
    });
    return;
  }

  // Validate client secret if provided and configured
  if(rp.clientSecret && client_secret !== rp.clientSecret) {
    res.status(401).send({
      error: 'invalid_client',
      error_description: 'Invalid client credentials',
    });
    return;
  }

  req.rp = rp;
  next();
};

const attachClientByWorkflowId = async (req, res, next) => {
  const rp = config.opencred.relyingParties.find(
    r => r.workflow?.id == req.params.workflowId,
  );
  if(!rp) {
    res.status(404).send({message: 'Unknown workflow id'});
    return;
  }
  req.rp = rp;
  next();
};

// Export attachClientByBody so it can be used with the token endpoint
export {attachClientByBody};

export default function(app) {
  app.get('/context/login', attachClientByQuery);
  app.get('/context/verification', attachClientByQuery);
  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId',
    attachClientByWorkflowId,
  );

  app.post('/workflows/:workflowId/exchanges', attachClientByWorkflowId);
  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId',
    attachClientByWorkflowId,
  );
  app.post(
    '/workflows/:workflowId/exchanges/:exchangeId',
    attachClientByWorkflowId,
  );
  app.post(
    '/workflows/:workflowId/exchanges/:exchangeId/reset',
    attachClientByWorkflowId,
  );
  // eslint-disable-next-line max-len
  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId/openid/' +
      'client/authorization/request',
    attachClientByWorkflowId,
  );
  // eslint-disable-next-line max-len
  app.post(
    '/workflows/:workflowId/exchanges/:exchangeId/openid/' +
      'client/authorization/response',
    attachClientByWorkflowId,
  );
}
