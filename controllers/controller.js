import {renderToString} from 'vue/server-renderer';
import {zcapWriteRequest} from '../services/http.js';

import {
  defaultLanguage, exchanger, relyingParties, theme, translations
} from '../config/config.js';
import {createApp} from '../ui/app.js';

export async function exchangeCodeForToken(req, res) {
  res.status(500).send('Not implemented');
}

export async function login(req, res) {
  // Validate the client_id parameter from the request

  // If the client_id is not in the relyingParties array, throw an error
  if(!relyingParties.map(rp => rp.client_id).includes(req.query.client_id)) {
    res.status(400).send({message: 'Unknown client_id'});
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

  // Generate exchange initiation request payload
  const expectedContext = [
    'https://www.w3.org/2018/credentials/v1',
    rp.credential_context
  ];
  const expectedType = ['VerifiableCredential', rp.credential_type];

  // TODO: update tests
  const {result} = await zcapWriteRequest({
    endpoint: exchanger.base_url,
    zcap: {
      capability: exchanger.capability,
      clientSecret: exchanger.clientSecret
    },
    json: {
      ttl: 60 * 15,
      variables: {
        verifiablePresentationRequest: rp.vpr
      }
    }
  });
  if(result.status !== 204) {
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
    OID4VCI: 'openid-verification-request://?credential_offer=' +
    encodeURIComponent(JSON.stringify(unencodedOffer))
  };

  const vueApp = createApp({
    step: 'login',
    rp,
    translations,
    defaultLanguage,
    theme,
    exchangeData: exchangeResponse
  });
  const rendered = await renderToString(vueApp);

  res.status(200).send(`<!DOCTYPE html>
<html>
  <head>
    <title>Login to ${rp.name}</title>
  </head>
  <body>
    <div id="app">${rendered}</div>
  </body>
</html>`);
  return;
}
