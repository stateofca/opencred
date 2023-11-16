import {config} from '../config/config.js';

const attachClientByQuery = async (req, res, next) => {
  if(!req.query.client_id) {
    res.status(400).send({message: 'client_id is required'});
    return;
  }
  const rp = config.relyingParties.find(
    r => r.clientId == req.query.client_id
  );
  if(!rp) {
    res.status(400).send({message: 'Unknown client_id'});
  }
  req.rp = rp;
  next();
};

const attachClientByBody = async (req, res, next) => {
  if(!req.body.client_id) {
    res.status(400).send({message: 'client_id is required'});
    return;
  }
  const rp = config.relyingParties.find(
    r => r.clientId == req.body.client_id
  );
  if(!rp) {
    res.status(400).send({message: 'Unknown client_id'});
  }

  if(!req.body.client_secret) {
    res.status(400).send({message: 'client_secret is required'});
    return;
  }
  if(rp.clientSecret !== req.body.client_secret) {
    res.status(400).send({message: 'Invalid client_secret'});
    return;
  }

  req.rp = rp;
  next();
};

const attachClientByWorkflowId = async (req, res, next) => {
  const rp = config.relyingParties.find(
    r => r.workflow?.id == req.params.workflowId
  );
  if(!rp) {
    res.status(404).send({message: 'Unknown workflow id'});
    return;
  }
  req.rp = rp;
  next();
};

export default function(app) {
  app.get('/login', attachClientByQuery);
  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId',
    attachClientByWorkflowId
  );
  app.post('/token', attachClientByBody);

  app.post('/workflows/:workflowId/exchanges', attachClientByWorkflowId);
  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId', attachClientByWorkflowId
  );
  app.post(
    '/workflows/:workflowId/exchanges/:exchangeId', attachClientByWorkflowId
  );
  // eslint-disable-next-line max-len
  app.get('/workflows/:workflowId/exchanges/:exchangeId/openid/client/authorization/request', attachClientByWorkflowId);
  // eslint-disable-next-line max-len
  app.post('/workflows/:workflowId/exchanges/:exchangeId/openid/client/authorization/response', attachClientByWorkflowId);
}
