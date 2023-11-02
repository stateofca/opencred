import {
  relyingParties
} from '../config/config.js';

const attachClient = async (req, res, next) => {
  if(!req.query.client_id) {
    res.status(400).send({message: 'client_id is required'});
    return;
  }
  const rp = relyingParties.find(r => r.client_id == req.query.client_id);
  if(!rp) {
    res.status(400).send({message: 'Unknown client_id'});
  }

  req.rp = rp;
  next();
};
const attachClientByWorkflowId = async (req, res, next) => {
  const rp = relyingParties.find(
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
  app.get('/login', attachClient);
  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId',
    attachClientByWorkflowId
  );
  app.post('/token', attachClient);

  app.post('/workflows/:workflowId/exchanges', attachClientByWorkflowId);
  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId', attachClientByWorkflowId
  );
  // eslint-disable-next-line max-len
  app.get('/workflows/:workflowId/exchanges/:exchangeId/openid/client/authorization/request', attachClientByWorkflowId);
  // eslint-disable-next-line max-len
  app.post('/workflows/:workflowId/exchanges/:exchangeId/openid/client/authorization/response', attachClientByWorkflowId);
}
