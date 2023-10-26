import {zcapReadRequest, zcapWriteRequest} from '../../common/zcap.js';

import {
  relyingParties, workflow
} from '../../config/config.js';

export default function(app) {
  app.use('/login', async (req, res, next) => {
    // If the client_id is not in the relyingParties array, throw an error
    if(!relyingParties.map(rp => rp.client_id).includes(req.query.client_id)) {
      res.status(400).send({message: 'Unknown client_id'});
      return;
    }
    const rp = relyingParties.find(rp => rp.client_id == req.query.client_id);
    const query = JSON.parse(rp.vpr_query);
    const expectedType = query.credentialQuery.type;
    const expectedContext = query.credentialQuery['@context'];

    // TODO: update tests
    const {result} = await zcapWriteRequest({
      endpoint: workflow.base_url,
      zcap: {
        capability: workflow.capability,
        clientSecret: workflow.clientSecret
      },
      json: {
        ttl: 60 * 15,
        variables: {
          verifiablePresentationRequest: {
            query,
            domain: rp.domain
          }
        }
      }
    });
    if(!result) {
      res.status(500).send({
        message: 'Error initiating exchange: check workflow configuration.'
      });
      return;
    } else if(result.status !== 204) {
      res.status(500).send({
        message: 'Error initiating exchange'
      });
      return;
    }

    const exchangeId = result.headers.get('location');

    const unencodedOffer = {
      credential_issuer: exchangeId,
      credentials: [{
        format: 'ldp_vc',
        credential_definition: {
          '@context': expectedContext,
          type: expectedType,
        }
      }],
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': 'db011b91-cd1c-481f-a34c-eb45ee39be3a'
        }
      }
    };
    const exchangeResponse = {
      vcapi: exchangeId,
      OID4VP: 'openid-verification-request://?credential_offer=' +
      encodeURIComponent(JSON.stringify(unencodedOffer))
    };

    req.exchange = {
      protocols: exchangeResponse
    };
    next();
  });

  app.use('/exchange', async (req, res, next) => {
    const {data, error} = await zcapReadRequest({
      endpoint: req.query.exchangeId,
      zcap: {
        capability: workflow.capability,
        clientSecret: workflow.clientSecret
      }
    });
    if(error) {
      res.sendStatus(404);
    } else {
      req.exchange = data;
    }
    next();
  });
}
