/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as JWT from '@digitalbazaar/minimal-jwt';
import {config} from '@bedrock/core';
import crypto from 'node:crypto';
import {JSONPath} from 'jsonpath-plus';

/**
 * Generates a JWT id_token from a VP exchange if the exchange is complete.
 *
 * @param {object} exchange - The exchange object.
 * @param {object} workflow - The workflow configuration.
 * @returns {Promise<string>} The JWT id_token.
 */
export const jwtFromExchange = async (exchange, workflow) => {
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
  const credentials =
    stepResults?.verifiablePresentation?.verifiableCredential ?? [];
  const extracted = extractClaimsForIdToken(
    credentials,
    workflow.oidc?.claims ?? []
  );
  if(!extracted) {
    return null;
  }

  const {sub, ...claims} = extracted;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.server.baseUri,
    aud: workflow.clientId,
    sub,
    iat: now,
    exp: now + (workflow.oidc?.idTokenExpirySeconds ?? 3600),
    ...claims
  };

  const jwt = await JWT.sign({payload, header, signFn});
  return jwt.toString();
};

/**
 * Extracts sub and claims from credentials for id_token payload.
 * For each claim, finds the first credential matching claim.format and extracts
 * the value.
 *
 * @param {Array<object>} credentials - Verifiable credentials from VP.
 * @param {Array<{name: string, path: string, format?: string}>} claimsConfig
 *   Claim config from workflow.oidc.claims.
 * @returns {object|null} { sub, ...claims } or null if no credentials.
 */
export function extractClaimsForIdToken(credentials, claimsConfig) {
  if(!credentials || credentials.length === 0) {
    return null;
  }

  const firstCred = credentials[0];
  const sub = _extractSubject(firstCred);
  if(!sub) {
    return null;
  }

  const result = {sub};

  for(const claimConfig of claimsConfig ?? []) {
    const {name, path, format = 'ldp_vc'} = claimConfig;
    const credential = _findCredentialForFormat(credentials, format);
    if(!credential) {
      continue;
    }

    const subject = credential.credentialSubject ?? {};
    const jsonPath = _normalizePathForFormat(path, format);
    const values = JSONPath({path: jsonPath, json: subject});
    if(values && values.length > 0 && values[0] !== undefined) {
      result[name] = values[0];
    }
  }

  return result;
}

// The mDL document number is the stable OIDC subject for mso_mdoc
// presentations. The enveloped credential id is the entire base64 mDL
// DeviceResponse — regenerated every presentation — so using it as `sub`
// yields a non-deterministic identifier that also leaks the whole mDL.
const MDOC_DOCUMENT_NUMBER_KEY = 'org.iso.18013.5.1.document_number';

/**
 * Determines the OIDC `sub` for a credential. For an mso_mdoc (mDL) credential
 * the subject is the document number. When the document number was not
 * disclosed, or for a non-mdoc credential, falls back to the W3C
 * `credentialSubject.id` and then the credential id (the prior behavior).
 *
 * @param {object} credential - Verifiable credential.
 * @returns {string|null} Subject identifier, or null when none is available.
 */
function _extractSubject(credential) {
  const credentialSubject = credential?.credentialSubject ?? {};
  if(_getCredentialFormat(credential) === 'mso_mdoc') {
    const documentNumber = credentialSubject[MDOC_DOCUMENT_NUMBER_KEY];
    if(documentNumber) {
      return documentNumber;
    }
  }
  return credentialSubject.id ?? credential?.id ?? null;
}

/**
 * Normalizes path for JSONPath query based on credential format.
 * For mso_mdoc, uses bracket notation for dotted keys.
 *
 * @param {string} path - Path from config.
 * @param {string} format - Credential format.
 * @returns {string} JSONPath string.
 */
function _normalizePathForFormat(path, format) {
  if(format === 'mso_mdoc') {
    return path.startsWith('$') ? path : `$['${path}']`;
  }
  return path.startsWith('$') ? path : `$.${path}`;
}

/**
 * Detects credential format from credential structure.
 *
 * @param {object} credential - Verifiable credential.
 * @returns {string} 'mso_mdoc' or 'ldp_vc'.
 */
function _getCredentialFormat(credential) {
  const type = credential?.type;
  const id = credential?.id;
  const isMdoc = type === 'EnvelopedVerifiableCredential' &&
    typeof id === 'string' &&
    id.startsWith('data:application/');
  return isMdoc ? 'mso_mdoc' : 'ldp_vc';
}

/**
 * Finds first credential matching the given format.
 *
 * @param {Array<object>} credentials - Credentials array.
 * @param {string} format - Target format.
 * @returns {object|undefined} Matching credential or undefined.
 */
function _findCredentialForFormat(credentials, format) {
  for(const cred of credentials) {
    if(_getCredentialFormat(cred) === format) {
      return cred;
    }
  }
  return undefined;
}
