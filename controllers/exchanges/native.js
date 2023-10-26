import {createId} from '../../common/utils.js';
import {MongoClient} from 'mongodb';

import {
  databaseConnectionUri, relyingParties, workflow
} from '../../config/config.js';

const client = new MongoClient(databaseConnectionUri);
const db = client.db('OpenCred');
const exchanges = db.collection('Exchanges');

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

  app.post('/workflows/:workflowId/exchanges/:exchangeId', async (req, res) => {
    if(workflow.id !== req.params.workflowId) {
      res.status(400).send({message: 'Incorrect workflowId'});
      return;
    }
    const exchange = await exchanges.findOne({id: req.params.exchangeId});
    const step = workflow.steps.find(s => s.hasOwnProperty(exchange.step));
    if(exchange) {
      res.send({
        verifiablePresentationRequest:
          {
            ...JSON.parse(step[exchange.step].verifiablePresentationRequest),
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
// {
//   "id": <full exchange ID, absolute URL>,
//   "sequence": <an integer that increments with each update to the exchange;
// used to resolve conflicts when updating the exchange state>,
//   "ttl": <TTL in ms>,
//   "state": "pending"|"complete"|"invalid",
//   // this i don't expect us to fully use just yet
//   // because we will maybe hard code exchanges rather
//   // than use templates?
//   "variables": {},
//   // the step information is stored in the "workflow"
//   // as it's the same for every exchange based off of
//   // that workflow; that's where templates and common
//   // values are stored
//   "step": <a semantic string ID for the current step>
// }

// WORKFLOW

// {
//   // for workflow change tracking/conflict resolution
//   "sequence": <integer that increments on each successful update>,
//   // we use this for authz, indicates core controller
//   // of the workflow
//   "controller": <url usually a DID>,
//   // this is a map of zcap semantic names => zcaps
//   // that we use to allow a workflow to issue/verify
//   // VCs with authz calls to VC API issuer and
//   // verifier services
//   "zcaps": <a map of zcap semantic names => zcaps>,
//   // we allow clients to use zcaps to edit the
//   // workflow but we also enable additional authz
//   // mechanisms, such as oauth2 to be used...
//   "authorization": {
//     // we use this to enable oauth2-based authz for
//     // editing the workflow and creating exchanges
//     // off of it; this is totally unrelated to
//     // OID4VCI/OID4VP
//     "oauth2": {
//       // this is the oauth2 "issuer" authorization
//       // server metadata config URL
//       issuerConfigUrl: "https://myoauth.server/.well-known/oauth-authorization-server"
//     }
//   },
//   // one or more VC templates (an exchange can issue
//   // one or more VCs)
//   "credentialTemplates": [{
//     "type": <type of template, e.g., 'jsonata'>,
//           // template for the VC, will use the
//           // current 'variables' from each exchange and
//           // produce the VC to be issued
//     "template": <template for VC>
//   }],
//   // a map of semantically named steps, each with
//   // information to be reused in every created
//   // exchange that is based on this workflow
//   "steps": {
//     // example name, could be anything
//     "didAuthn": {
//       // optional template to generate the step using
//       // variables from the exchange, either this
//       // property is present or the other ones below
//       // are, but not both sets
//       "stepTemplate": {
//         "type": <type of template, e.g., 'jsonata'>,
//         // template for the step, will use the
//         // current 'variables' from each exchange and
//         // produce the step, including properties
//         // such as "verifiablePresentationRequest"
//         // and "nextStep", etc.
//         "template": <template for the step>
//       },
//       // an optional step directive that tells the
//       // exchange to handle challenge management via
//       // a VC API verifier service it has a zcap for
//       "createChallenge": true,
//       // a base VPR to send to the user in this step,
//       // will have its challenge auto-generated if
//       // `createChallenge: true` is set, otherwise
//       // will use whatever is present (or not) below:
//       "verifiablePresentationRequest": {
//         "query": {
//           "type": "DIDAuthentication",
//           "acceptedMethods": [{"method": "key"}]
//         },
//         "domain": <if domain is known, it can be a hard-coded value here>
//       },
//       // optional the name of the step that follows
//       // this one, if the user provides a VP that
//       // meets the VPR requirements, not present if
//       // this is the last step
//       "nextStep": <next step name>
//       // optional and present to trigger OID4VP
//       "openId": {
//         // optional, auto-generate the OID4VP
//         // authz request from the VPR and store it
//         // in "variables.varname"; use this OR use
//         // "authorizationRequest", not both
//         "createAuthorizationRequest": "<varname>",
//         // provide a specific OID4VP authz request
//         "authorizationRequest: {...}
//       }
//     }
//   },
//   // indicates which step, from the above steps, that
//   // a new exchange starts on
//   "initialStep": "didAuthn",    
//   // any other non-standard properties
//   ...
// }
