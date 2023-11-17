import * as JWT from '@digitalbazaar/minimal-jwt';
import crypto from 'node:crypto';
import jp from 'jsonpath';

import {config} from '../config/config.js';
import {domainToDidWeb} from '../controllers/didWeb.js';

/**
 * Generates a JWT id_token from a VP exchange if the exchange is complete.
 * @param {import("mongodb").Document}
 * @param {import("../config/config").RelyingParty} rp
 */
export const jwtFromExchange = async (exchange, rp) => {
  const signingKey = config.signingKeys?.find(
    sk => sk.purpose.includes('id_token')
  );
  if(!signingKey) {
    throw new Error('No signing key found in config with purpose id_token');
  }

  const {privateKeyPem, publicKeyPem} = signingKey;
  const rehydratedKey = crypto.createPrivateKey({
    key: privateKeyPem.toString('hex'),
    format: 'pem',
    type: 'pkcs8'
  });

  const signFn = async ({data}) => {
    const sign = crypto.createSign('SHA256');
    sign.write(data);
    sign.end();
    const sig = sign.sign(rehydratedKey, 'hex');
    return sig;
  };

  const header = {
    alg: 'ES256',
    typ: 'JWT',
    kid: crypto.createHash('sha256').update(publicKeyPem).digest('hex')
  };

  const stepResultKey = Object.keys(exchange.variables.results).find(
    v => v == exchange.step || v == 'templated-vpr'
  );
  const stepResults = exchange.variables.results[stepResultKey];
  const c = jp.query(
    stepResults, '$.verifiablePresentation.verifiableCredential[0]'
  );
  if(!c.length) {
    return null;
  }

  const payload = {
    iss: config.domain,
    aud: rp.redirectUri,
    sub: c[0].credentialSubject.id
  };

  for(const {name, path} of rp.claims ?? []) {
    const claim = jp.query(c[0].credentialSubject, path);
    if(claim) {
      payload[name] = claim[0];
    }
  }

  const jwt = await JWT.sign({payload, header, signFn});
  return jwt.toString();
};

