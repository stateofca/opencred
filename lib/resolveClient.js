/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';

export const attachClientByQuery = async (req, res, next) => {
  if(!req.query.client_id) {
    res.status(400).send({message: 'client_id is required'});
    return;
  }
  const rp = config.opencred.workflows.find(
    workflow => workflow.clientId == req.query.client_id
  );
  if(!rp) {
    res.status(400).send({message: 'Unknown client_id'});
    return;
  }
  req.rp = rp;
  next();
};

export const attachClientByWorkflowId = async (req, res, next) => {
  const rp = config.opencred.workflows.find(
    workflow => workflow.clientId == req.params.workflowId
  );
  if(!rp) {
    res.status(404).send({message: 'Unknown workflow id'});
    return;
  }
  if(req.rp && req.rp.clientId !== rp.clientId) {
    res.status(401).send({
      message: 'Unknown client_id or invalid authentication.'});
    return;
  }
  req.rp = rp;
  next();
};
