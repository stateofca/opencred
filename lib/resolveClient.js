/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';

export const attachClientByQuery = async (req, res, next) => {
  if(!req.query.client_id) {
    res.status(400).send({message: 'client_id is required'});
    return;
  }
  const workflow = config.opencred.workflows.find(
    workflow => workflow.clientId == req.query.client_id
  );
  if(!workflow) {
    res.status(400).send({message: 'Unknown client_id'});
    return;
  }
  req.workflow = workflow;
  next();
};

export const attachClientByWorkflowId = async (req, res, next) => {
  const workflow = config.opencred.workflows.find(
    workflow => workflow.clientId == req.params.workflowId
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
