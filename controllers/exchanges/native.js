
import {verify, verifyCredential} from '@digitalbazaar/vc';
import {createId} from '../../common/utils.js';
import {exchanges} from '../../common/database.js';
import {getDocumentLoader} from '../../common/documentLoader.js';
import jp from 'jsonpath';
import {oid4vp} from '@digitalbazaar/oid4-client';
import {SUITES} from '../../common/suites.js';
import {UnsecuredJWT} from 'jose';

export const createExchange = async (domain, workflow) => {
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
  const vcapi = `${domain}/workflows/${workflow.id}/exchanges/${id}`;
  const authzReqUrl = `${vcapi}/openid/client/authorization/request`;
  const searchParams = new URLSearchParams({
    client_id: `${vcapi}/openid/client/authorization/response`,
    request_uri: authzReqUrl
  });
  const OID4VP = 'openid4vp://authorize?' + searchParams.toString();
  return {exchangeId: id, vcapi, OID4VP};
};

export const createNativeExchange = async (req, res, next) => {
  const rp = req.rp;
  if(!rp || !rp.workflow || rp.workflow.type !== 'native') {
    next();
    return;
  }
  req.exchange = await createExchange(rp.domain, rp.workflow);
  next();
};

export default function(app) {
  app.post('/workflows/:workflowId/exchanges', createNativeExchange);

  app.get('/login', createNativeExchange);

  app.get('/workflows/:workflowId/exchanges/:exchangeId', async (req, res,
    next) => {
    const rp = req.rp;
    if(!rp || !rp.workflow || rp.workflow.type !== 'native') {
      next();
      return;
    }

    req.exchange = await exchanges.findOne({id: req.params.exchangeId});
    next();
  });

  // eslint-disable-next-line max-len
  app.get('/workflows/:workflowId/exchanges/:exchangeId/openid/client/authorization/request', async (req, res) => {
    const exchange = await exchanges.findOne({id: req.params.exchangeId});
    if(!exchange) {
      res.sendStatus(404);
      return;
    }
    if(exchange.state !== 'pending') {
      res.status(400).send(`Exchange in state ${exchange.state}`);
      return;
    }
    const step = req.rp.workflow.steps[exchange.step];

    const vpr = JSON.parse(step.verifiablePresentationRequest);
    vpr.domain = `${req.protocol}://${req.get('host')}${
      req.originalUrl.replace('request', 'response')}`;
    vpr.challenge = exchange.id;

    const authRequest = {
      ...oid4vp.fromVpr({verifiablePresentationRequest: vpr}),
      client_id: vpr.domain,
    };
    const jwt = new UnsecuredJWT(authRequest).encode();
    res.set('Content-Type', 'application/oauth-authz-req+jwt');
    res.send(jwt);
    return;
  });

  // eslint-disable-next-line max-len
  app.post('/workflows/:workflowId/exchanges/:exchangeId/openid/client/authorization/response', async (req, res) => {
    const exchange = await exchanges.findOne({id: req.params.exchangeId});
    if(!exchange) {
      res.sendStatus(404);
      return;
    }
    if(exchange.state !== 'pending') {
      await exchanges.updateOne({
        id: exchange.id
      }, {$set: {state: 'invalid', updatedAt: Date.now()}});
      res.status(400).send(`Exchange in state ${exchange.state}`);
      return;
    }
    try {
      const vp_token = JSON.parse(req.body.vp_token);
      const submission = JSON.parse(req.body.presentation_submission);
      if(vp_token.proof.challenge !== exchange.id) {
        res.status(400).send(`Invalid nonce`);
        return;
      }
      const errors = [];
      let vpVerified = false;
      const documentLoader = getDocumentLoader().build();

      for(const descriptor of submission.descriptor_map) {
        if(descriptor.format === 'ldp_vp') {
          if(!vpVerified) {
            const result = await verify({
              presentation: vp_token,
              documentLoader,
              suite: SUITES,
              challenge: vp_token.proof.challenge
            });
            if(!result.verified) {
              console.log('TODO get proper error from', result);
              errors.push(result.error);
            } else {
              vpVerified = true;
            }
          }
          const vc = jp.query(vp_token, descriptor.path_nested.path)[0];
          const result = await verifyCredential({
            credential: vc,
            documentLoader,
            suite: SUITES,
          });
          if(!result.verified) {
            console.log('TODO get proper error from', result);
            errors.push(result.error);
          }
        } else {
          errors.push(`Format ${descriptor.format} not yet supported.`);
        }
        //      (6.5. VP Token Validation)
        // TODO make sure presentation_submission matches authorization request
      }
      if(errors.length > 0) {
        console.error('errors: ', errors);
        res.status(400).send({errors});
        return;
      }
      const update = {
        $inc: {sequence: 1},
        $set: {
          updatedAt: Date.now(),
          state: 'complete',
          variables: {
            results: {
              'templated-vpr': {
                verifiablePresentation: vp_token
              }
            }
          }
        }
      };
      try {
        await exchanges.updateOne({
          id: exchange.id,
          state: 'pending'
        }, update);
      } catch(e) {
        console.error('failed to update state', e);
      }
      res.sendStatus(204);
      return;
    } catch(e) {
      console.error(e);
      res.sendStatus(500);
      return;
    }
  });

  app.post('/workflows/:workflowId/exchanges/:exchangeId', async (req, res) => {
    if(req.rp.workflow.id !== req.params.workflowId) {
      res.status(400).send({message: 'Incorrect workflowId'});
      return;
    }
    const exchange = await exchanges.findOne({id: req.params.exchangeId});
    const step = req.rp.workflow.steps[exchange.step];
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
}
