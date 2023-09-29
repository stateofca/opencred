import * as fetch from 'node-fetch';

// import {render} from '../ui/entry-server.js';

import {
  defaultLanguage, exchanger, relyingParties, theme, translations
} from '../config/config.js';

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
  const vcApiExchangeinitiationPayload = {
    type: 'VerifiablePresentationRequest',
    credentialQuery: [{
      type: 'QueryByExample',
      reason: `Login to ${rp.name}`,
      example: {
        '@context': expectedContext,
        type: expectedType,
        issuer: rp.credential_issuer
      }
    }]
  };

  // TODO: Implement calling actual exchanger, and update tests
  // const response = await fetch(exchanger, {
  //   method: 'POST',
  //   body: JSON.stringify(vcApiExchangeinitiationPayload),
  //   headers: {'Content-Type': 'application/json'}
  // });

  // if(!response.ok) {
  //   res.status(500).send({
  //     message: 'Error initiating exchange',
  //     details: await response.json()
  //   });
  //   return;
  // }

  // const exchangeResponse = await response.json();

  const exchangeId = 'z19pEANL8bzMFJMTkuhhkAPWy';
  const exchangerSession = `${exchanger.base_url}/exchanges/${exchangeId}`;
  const unencodedOffer = {
    credential_issuer: exchangerSession,
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
    vcapi: exchangerSession,
    OID4VCI: 'openid-verification-request://?credential_offer=' +
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
  const manifest = {};
  const render = (await import('../dist/server/entry-server.js')).render;
  const [rendered, preloadLinks] = await render(manifest, safeContext);

  const completeHtml = `<!DOCTYPE html>
  <html>
    <head>
      <title>Login to ${rp.name}</title>
      ${preloadLinks}
      <script type="module" src="/ui/entry-client.js"></script>
      <script>
        window.ctx = ${JSON.stringify(safeContext)};
      </script>
    </head>
    <body>
      <div id="app">${rendered}</div>
    </body>
  </html>`;

  res.status(200).send(completeHtml);
  return;
}
