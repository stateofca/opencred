import {
  relyingParties, workflow
} from '../../config/config.js';
import {createId} from '../../common/utils.js';
import {exchanges} from '../../common/database.js';

export const createExchange = async domain => {
  const id = await createId();
  const challenge = await createId();
  await exchanges.insertOne({
    id,
    sequence: 0,
    ttl: 900,
    state: 'pending',
    variables: {},
    step: workflow.initialStep,
    challenge
  });
  return {exchangeId: `${domain}/workflows/${workflow.id}/exchanges/${id}`};
};

export default function(app) {
  app.use('/login', async (req, res, next) => {
    // If the client_id is not in the relyingParties array, throw an error
    if(!relyingParties.map(rp => rp.client_id).includes(req.query.client_id)) {
      res.status(400).send({message: 'Unknown client_id'});
      return;
    }
    const rp = relyingParties.find(rp => rp.client_id == req.query.client_id);
    const {exchangeId} = await createExchange(rp.domain);
    const authzReqUrl = `${exchangeId}/openid/client/authorization/request`;
    const searchParams = new URLSearchParams({
      client_id: `${exchangeId}/openid/client/authorization/response`,
      request_uri: authzReqUrl
    });
    const openid4vpUrl = 'openid4vp://authorize?' + searchParams.toString();
    req.exchange = {
      vcapi: exchangeId,
      OID4VP: openid4vpUrl
    };
    next();
  });

  // eslint-disable-next-line max-len
  app.get('/workflows/:workflowId/exchanges/:exchangeId/openid/client/authorization/request', async (req, res) => {
    // TODO
    // fetch exchange state
    // create authorization request
    // presentation definition?
    // nonce = exchangeId?
    //
    res.send('True');
    return;
  });

  app.post('/workflows/:workflowId/exchanges/:exchangeId', async (req, res) => {
    if(workflow.id !== req.params.workflowId) {
      res.status(400).send({message: 'Incorrect workflowId'});
      return;
    }
    const exchange = await exchanges.findOne({id: req.params.exchangeId});
    const step = workflow.steps[exchange.step];
    if(exchange) {
      res.send({
        verifiablePresentationRequest:
          {
            ...JSON.parse(step.verifiablePresentationRequest),
            challenge: exchange.challenge
          }
      });
      return;
    }
    res.sendStatus(404);
    return;
  });

  app.use('/exchange', async (req, res) => {
    res.sendStatus(501);
    return;
  });
}
