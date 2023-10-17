import {zcapReadRequest, zcapWriteRequest} from '../common/zcap.js';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

import {
  defaultLanguage, exchanger, relyingParties, theme, translations
} from '../config/config.js';

import {render} from '../dist/server/entry-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manifest = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../dist/client/ssr-manifest.json'), 'utf-8'));
const template = fs.readFileSync(
  path.join(__dirname, '../dist/client/index.html'), 'utf-8');

export async function exchangeCodeForToken(req, res) {
  res.status(500).send('Not implemented');
}

export async function login(req, res) {
  // Validate the client_id parameter from the request

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
    endpoint: exchanger.base_url,
    zcap: {
      capability: exchanger.capability,
      clientSecret: exchanger.clientSecret
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
      message: 'Error initiating exchange: check exchanger configuration.'
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
  const [rendered, preloadLinks] = await render(manifest, safeContext);
  const html = template
    .replace(`<!--preload-links-->`, preloadLinks)
    .replace(`<!--app-html-->`, rendered)
    .replace(`<!--app-context-->`, `<script>window.ctx =
      ${JSON.stringify(safeContext)};</script>`)
    .replace(`<!--app-title-->`, `<title>${rp.name} Login</title>`);

  res.status(200).set({'Content-Type': 'text/html'}).end(html);
  return;
}

export const getExchangeStatus = async (req, res) => {
  const {data, error} = await zcapReadRequest({
    endpoint: req.query.exchangeId,
    zcap: {
      capability: exchanger.capability,
      clientSecret: exchanger.clientSecret
    }
  });
  if(error) {
    res.sendStatus(404);
  } else {
    res.send(data);
  }
  return;
};

export const health = (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
  };
  try {
    res.send(healthCheck);
  } catch(error) {
    healthCheck.message = error;
    res.status(503);
    res.send(healthCheck);
  }
};
