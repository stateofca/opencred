import * as JWT from '@digitalbazaar/minimal-jwt';
import {config} from '@bedrock/core';
import crypto from 'node:crypto';
import jp from 'jsonpath';

/**
 * Generates a JWT id_token from a VP exchange if the exchange is complete.
 * @param {import("mongodb").Document}
 * @param {import("../configs/config.js").RelyingParty} rp
 */
export const jwtFromExchange = async (exchange, rp) => {
  const signingKey = config.opencred.signingKeys?.find(
    sk => sk.purpose.includes('id_token')
  );
  if(!signingKey) {
    throw new Error('No signing key found in config with purpose id_token');
  }

  const {privateKeyPem} = signingKey;
  const rehydratedKey = crypto.createPrivateKey(privateKeyPem);

  const signFn = async ({data}) => {
    let algorithm;
    if(signingKey.type === 'RS256') {
      algorithm = 'RSA-SHA256';
    } else if(signingKey.type === 'ES256') {
      algorithm = 'SHA256';
    } else {
      throw new Error('Unsupported algorithm');
    }
    const sign = crypto.createSign(algorithm);
    sign.write(data);
    sign.end();
    const sig = sign.sign(rehydratedKey, 'base64url');
    return sig;
  };

  const header = {
    alg: signingKey.type,
    typ: 'JWT',
    kid: signingKey.id
  };

  const stepResultKey = Object.keys(exchange.variables.results).find(
    v => v == exchange.step
  );
  const stepResults = exchange.variables.results[stepResultKey];
  const c = jp.query(
    stepResults, '$.verifiablePresentation.verifiableCredential[0]'
  );
  if(!c.length) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.server.baseUri,
    aud: rp.clientId,
    sub: c[0].credentialSubject.id,
    iat: now,
    exp: now + rp.idTokenExpirySeconds
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

