import {
  relyingParties, workflow
} from '../../config/config.js';
import {createId} from '../../common/utils.js';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {Ed25519VerificationKey2020} from
  '@digitalbazaar/ed25519-verification-key-2020';
import {exchanges} from '../../common/database.js';
import {getDocumentLoader} from '../../common/documentLoader.js';
import {oid4vp} from '@digitalbazaar/oid4-client';
import {UnsecuredJWT} from 'jose';
import {verifyCredential} from '@digitalbazaar/vc';

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
    const exchange = await exchanges.findOne({id: req.params.exchangeId});
    if(!exchange) {
      res.sendStatus(404);
      return;
    }
    if(exchange.state !== 'pending') {
      res.status(400).send(`Exchange in state ${exchange.state}`);
      return;
    }
    const step = workflow.steps[exchange.step];

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
      res.status(400).send(`Exchange in state ${exchange.state}`);
      return;
    }

    const vp_token = JSON.parse(req.body.vp_token);
    const submission = JSON.parse(req.body.presentation_submission);
    if(vp_token.proof.challenge !== exchange.id) {
      res.status(400).send(`Invalid nonce`);
      return;
    }
    const errors = [];
    for(const descriptor of submission.descriptor_map) {
      descriptor;
      // TODO ^^ use the actual descriptor to find the vc
      // TODO fork for vc_ldp / vc_jwt
      // TODO verify VP as well (can't verify v1 right now)
      //      (6.5. VP Token Validation)
      // TODO make sure presentation_submission matches authorization request
      const documentLoader = getDocumentLoader().build();
      const {document: vm} = await documentLoader(
        vp_token.verifiableCredential[0].proof.verificationMethod);
      const key = await Ed25519VerificationKey2020.from(vm);
      const suite = new Ed25519Signature2020({key});
      const result = await verifyCredential({
        credential: vp_token.verifiableCredential[0],
        documentLoader,
        suite,
      });
      if(!result.verified) {
        console.log('TODO get proper error from', result);
        errors.push(result.errors);
      }
    }
    if(errors.length > 0) {
      res.status(400).send('invalid_vp');
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
    const exchangeId = req.query.exchangeId;
    const match = exchangeId.match(/\/exchanges\/([^\/]+)$/);
    res.send({exchange: await exchanges.findOne({id: match[1]})});
    return;
  });
}
