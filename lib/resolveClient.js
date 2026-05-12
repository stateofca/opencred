/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';

/**
 * Find a workflow by identifier, trying clientId first then workflowId.
 * WorkflowId is used as a fallback to support legacy 9.x workflows that
 * had a separate URL path parameter from clientId. It is deprecated.
 *
 * @param {Array} workflows - Array of workflow configuration objects.
 * @param {string} identifier - The identifier to match (clientId or
 *   legacy workflowId).
 * @returns {object|undefined} The matching workflow, or undefined.
 */
export const findWorkflow = (workflows, identifier) => {
  return workflows.find(w => w.clientId === identifier) ??
    workflows.find(w => w.workflowId === identifier);
};

/**
 * Find a workflow by identifier and secret, trying clientId first then
 * workflowId.
 *
 * @param {Array} workflows - Array of workflow configuration objects.
 * @param {string} identifier - The identifier to match.
 * @param {string} secret - The client secret to match.
 * @returns {object|undefined} The matching workflow, or undefined.
 */
export const findWorkflowByCredentials = (workflows, identifier, secret) => {
  return workflows.find(
    w => w.clientId === identifier && w.clientSecret === secret
  ) ?? workflows.find(
    w => w.workflowId === identifier && w.clientSecret === secret
  );
};

export const attachClientByQuery = async (req, res, next) => {
  if(!req.query.client_id) {
    res.status(400).send({message: 'client_id is required'});
    return;
  }
  const workflow = findWorkflow(
    config.opencred.workflows, req.query.client_id
  );
  if(!workflow) {
    res.status(400).send({message: 'Unknown client_id'});
    return;
  }
  req.workflow = workflow;
  next();
};

export const attachClientByWorkflowId = async (req, res, next) => {
  const workflow = findWorkflow(
    config.opencred.workflows, req.params.workflowId
  );
  if(!workflow) {
    res.status(404).send({message: 'Unknown workflow id'});
    return;
  }
  if(req.workflow && req.workflow.clientId !== workflow.clientId) {
    res.status(401).send({
      message: 'Unknown client_id or invalid authentication.'});
    return;
  }
  req.workflow = workflow;
  next();
};
