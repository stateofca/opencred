import {zcapReadRequest, zcapWriteRequest} from '../../common/zcap.js';

import {
  defaultLanguage, relyingParties, theme, translations, workflow
} from '../../config/config.js';

export const createExchange = async (req, res, next) => {
  // If the client_id is not in the relyingParties array, throw an error
  if(!relyingParties.map(rp => rp.client_id).includes(req.query.client_id)) {
    res.status(400).send({message: 'Unknown client_id'});
    return;
  }
  const rp = relyingParties.find(rp => rp.client_id == req.query.client_id);

  // Validate Redirect URI is permitted
  if(!req.query.redirect_uri) {
    res.status(400).send({message: 'redirect_uri is required'});
    return;
  } else if(rp.redirect_uri != req.query.redirect_uri) {
    res.status(400).send({message: 'Unknown redirect_uri'});
    return;
  }

  // Validate scope is openid only.
  if(!req.query.scope) {
    res.status(400).send({message: 'scope is required'});
    return;
  } else if(req.query.scope !== 'openid') {
    res.status(400).send({message: 'Invalid scope'});
    return;
  }

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

  const safeContext = {
    step: 'login',
    rp: {
      redirect_uri: rp.redirect_uri,
      name: rp.name,
      icon: rp.icon,
      background_image: rp.background_image
    },
    translations,
    defaultLanguage,
    theme,
    exchangeData: exchangeResponse
  };

  req.safeContext = safeContext;
  next();
};

export const getExchangeStatus = async (req, res) => {
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
    res.send(data);
  }
  return;
};
