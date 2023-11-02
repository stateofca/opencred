
import {createId} from '../../common/utils.js';
import {exchanges} from '../../common/database.js';
import {getDocumentLoader} from '../../common/documentLoader.js';
import jp from 'jsonpath';
import {oid4vp} from '@digitalbazaar/oid4-client';
import {SUITES} from '../../common/suites.js';
import {UnsecuredJWT} from 'jose';
import {verifyUtils} from '../../common/utils.js';

export const createExchange = async (domain, workflow) => {
  const id = await createId();
  const workflowId = workflow.id;
  const accessToken = await createId();
  const challenge = await createId();
  await exchanges.insertOne({
    id,
    workflowId,
    sequence: 0,
    ttl: 900,
    state: 'pending',
    variables: {},
    step: workflow.initialStep,
    challenge,
    accessToken
  });
  const vcapi = `${domain}/workflows/${workflow.id}/exchanges/${id}`;
  const authzReqUrl = `${vcapi}/openid/client/authorization/request`;
  const searchParams = new URLSearchParams({
    client_id: `${vcapi}/openid/client/authorization/response`,
    request_uri: authzReqUrl
  });
  const OID4VP = 'openid4vp://authorize?' + searchParams.toString();
  return {id, vcapi, OID4VP, accessToken, workflowId};
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

export const verifySubmission = async (vp_token, submission, exchange) => {
  const errors = [];
  let vpVerified = false;
  const documentLoader = getDocumentLoader().build();
  const {presentation_definition} = exchange.variables.authorizationRequest;
  if(submission.definition_id !== presentation_definition.id) {
    errors.push(`Presentation Definition doesn't match Submission`);
  } else if(submission.descriptor_map.length !==
    presentation_definition.input_descriptors.length) {
    errors.push(`${presentation_definition.input_descriptors.length} ` +
      `Presentation Definition descriptors found and ` +
      `${submission.descriptor_map.length} Presentation Submission ` +
      `descriptors found`);
  } else {
    for(const descriptor of presentation_definition.input_descriptors) {
      const submitted = submission.descriptor_map
        .find(d => d.id === descriptor.id);
      if(!submitted) {
        errors.push(`Submission not found for input descriptor`);
      } else if(submitted.format === 'ldp_vp') {
        if(!vpVerified) {
          const result = await verifyUtils.verify({
            presentation: vp_token,
            documentLoader,
            suite: SUITES,
            challenge: vp_token.proof.challenge
          });
          if(!result.verified) {
            errors.push(result.error);
          }
          vpVerified = true;
        }
        const vc = jp.query(vp_token, submitted.path_nested.path)[0];
        const result = await verifyUtils.verifyCredential({
          credential: vc,
          documentLoader,
          suite: SUITES,
        });
        if(!result.verified) {
          errors.push(result.error);
        }
      } else {
        errors.push(`Format ${submitted.format} not yet supported.`);
      }
    }
  }
  if(errors.length > 0) {
    console.error('errors: ', errors);
    return {errors, verified: false};
  }
  return {errors, verified: true};
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
    if(!req.exchange) {
      req.exchange = await exchanges.findOne({id: req.params.exchangeId});
    }
    next();
  });

  app.get('/workflows/:workflowId/exchanges/:exchangeId/openid/client/' +
    'authorization/request', async (req, res) => {
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

    const authorizationRequest = {
      ...oid4vp.fromVpr({verifiablePresentationRequest: vpr}),
      client_id: vpr.domain,
    };
    await exchanges.updateOne({id: exchange.id}, {
      $set: {'variables.authorizationRequest': authorizationRequest}
    });
    const jwt = new UnsecuredJWT(authorizationRequest).encode();
    res.set('Content-Type', 'application/oauth-authz-req+jwt');
    res.send(jwt);
    return;
  });

  app.post('/workflows/:workflowId/exchanges/:exchangeId/openid/client/' +
    'authorization/response', async (req, res) => {
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
      const {verified, errors} = await verifySubmission(
        vp_token, submission, exchange
      );
      if(verified) {
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
        await exchanges.updateOne({
          id: exchange.id,
          state: 'pending'
        }, update);
        res.sendStatus(204);
        return;
      }
      res.status(400).send({errors});
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
