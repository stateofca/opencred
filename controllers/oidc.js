import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';

import {config} from '../config/config.js';
import {exchanges} from '../common/database.js';
import {jwtFromExchange} from '../common/jwt.js';
import {render} from '../dist/server/entry-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manifest = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../dist/client/ssr-manifest.json'), 'utf-8'));
const template = fs.readFileSync(
  path.join(__dirname, '../dist/client/index.html'), 'utf-8');

/**
 * Augment the app with middleware for OIDC that validates requests prior to
 * more in-depth processing.
 * @param {Express} app - Express app instance
 */
export const OidcValidationMiddleware = function(app) {
  app.get('/login', async (req, res, next) => {
    // Validate Redirect URI is permitted
    if(!req.query.redirect_uri) {
      res.status(400).send({
        error: 'invalid_grant',
        error_description: 'redirect_uri is required'
      });
      return;
    } else if(req.rp?.redirectUri != req.query.redirect_uri) {
      res.status(400).send({
        error: 'invalid_grant',
        error_description: 'Unknown redirect_uri'
      });
      return;
    }

    // Validate scope is openid only.
    if(!req.query.scope) {
      res.status(400).send({
        error: 'invalid_scope',
        error_description: 'scope is required'
      });
      return;
    } else if(req.query.scope !== 'openid') {
      res.status(400).send({
        error: 'invalid_scope',
        error_description: 'scope must be "openid"'
      });
      return;
    }

    next();
  });
};

export const login = async (req, res) => {
  const rp = req.rp;

  const context = {
    step: 'login',
    rp: {
      clientId: rp.clientId,
      redirectUri: rp.redirectUri,
      name: rp.name,
      icon: rp.icon,
      theme: rp.theme,
      backgroundImage: rp.backgroundImage,
      workflow: {
        type: rp.workflow.type,
        id: rp.workflow.id
      }
    },
    translations: config.translations,
    defaultLanguage: config.defaultLanguage,
    exchangeData: {
      ...req.exchange,
      QR: await QRCode.toDataURL(req.exchange.OID4VP)
    }
  };
  try {
    const [rendered, preloadLinks] = await render(manifest, context);
    const html = template
      .replace(`<!--preload-links-->`, preloadLinks)
      .replace(`<!--app-html-->`, rendered)
      .replace(`<!--app-context-->`, `<script>window.ctx =
      ${JSON.stringify(context)};</script>`)
      .replace(`<!--app-title-->`,
        `<title>${context.rp.name} Login</title>`);
    res.status(200).set({'Content-Type': 'text/html'}).end(html);
  } catch(e) {
    console.error(e);
    res.status(500).send('Error rendering page');
    return;
  }
};

export const exchangeCodeForToken = async (req, res) => {
  // Client ID and Secret should be validated by ResolveClientMiddleware
  const rp = req.rp;
  if(!rp) {
    res.status(500).send(
      {message: 'Unexpected server error. No registered client attached.'}
    );
    return;
  }

  // Validate code is present
  if(!req.body.code) {
    res.status(400).send({message: 'code is required'});
    return;
  }

  // Validate grant type
  if(!req.body.grant_type) {
    res.status(400).send({message: 'grant_type is required'});
    return;
  } else if(req.body.grant_type !== 'authorization_code') {
    res.status(400).send(
      {
        error: 'unsupported_grant_type',
        error_description: 'Invalid grant_type. Use authorization_code'}
    );
    return;
  }

  // Look up exchange by code and validate that it is for this RP.
  const exchange = await exchanges.findOne({'oidc.code': req.body.code});
  if(!exchange) {
    res.status(400).send({
      error: 'invalid_grant',
      error_description: 'Invalid code'
    });
    return;
  } else if(exchange.workflowId !== rp.workflow.id) {
    res.status(400).send({
      error: 'invalid_grant',
      error_description: 'Invalid code or client_id'
    });
    return;
  } else if(exchange.state !== 'complete') {
    res.status(400).send({
      error: 'invalid_grant',
      error_description: `Invalid code: Exchange status ${exchange.state}`
    });
    return;
  }

  try {
    const jwt_string = await jwtFromExchange(exchange, rp);
    const token = {
      access_token: 'NONE',
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: jwt_string
    };

    await exchanges.updateOne({id: exchange.id}, {
      $set: {oidc: {state: exchange.oidc?.state, code: null}}
    });

    res.send(token);
  } catch(e) {
    console.error(e);
    res.status(500).send({
      error: 'server_error',
      error_description: 'Error creating JWT: ' + e.message
    });
    return;
  }
};

export const jwksEndpoint = async (req, res) => {
  const jwks = config.signingKeys.filter(
    key => key.purpose.includes('id_token')
  ).map(key => {
    const rehydratedKey = crypto.createPublicKey({
      key: key.publicKeyPem.toString('hex'),
      format: 'pem',
      type: 'spki'
    });
    const jwkFormat = rehydratedKey.export({format: 'jwk', type: 'public'});
    return {
      kid: crypto.createHash('sha256').update(key.publicKeyPem).digest('hex'),
      ...jwkFormat
    };
  });

  res.send({
    keys: jwks
  });
};

export const openIdConfiguration = async (req, res) => {
  const info = {
    issuer: config.domain,
    authorization_endpoint: config.domain + '/login',
    token_endpoint: config.domain + '/token',
    jwks_uri: config.domain + '/.well-known/jwks.json',

    grant_types_supported: ['authorization_code'],
    response_types_supported: ['code', 'code id_token'],
    scopes_supported: ['openid'],
    subject_types_supported: ['public'],
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post'
    ],
    id_token_signing_alg_values_supported: ['ES256'],

    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    request_object_signing_alg_values_supported: ['none'],
    display_values_supported: ['page', 'touch'],
    claim_types_supported: ['normal'],
    claims_parameter_supported: false,
    service_documentation: 'https://github.com/digitalbazaar/opencred-platform',
    ui_locales_supported: Object.keys(config.translations)
  };

  res.send(info);
};
