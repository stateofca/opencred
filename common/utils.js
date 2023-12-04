import {verify, verifyCredential} from '@digitalbazaar/vc';
import {
  verifyCredential as verifyCredentialJWT,
  verifyPresentation as verifyPresentationJWT
} from 'did-jwt-vc';
import base64url from 'base64url';
import {ConfidentialClientApplication} from '@azure/msal-node';
import {didResolver} from './documentLoader.js';
import {generateId} from 'bnid';
import {httpClient} from '@digitalbazaar/http-client';

// General Utilities

export const createId = async (bitLength = 128) => {
  const id = await generateId({
    bitLength,
    encoding: 'base58',
    multibase: true,
    multihash: true
  });
  return id;
};

const _decodeJwtPayload = jwtToken => {
  const [, encodedPayloadString] = jwtToken.split('.');
  const decodedPayloadString = base64url.decode(encodedPayloadString);
  return JSON.parse(decodedPayloadString);
};

const _convertJwtVcTokenToLdpVcs = vcTokens => {
  return vcTokens.map(t => _decodeJwtPayload(t).vc);
};

export const convertJwtVpTokenToLdpVp = vpToken => {
  const decodedVpPayloadWithEncodedVcs = _decodeJwtPayload(vpToken).vp;
  const decodedVpPayload = {
    ...decodedVpPayloadWithEncodedVcs,
    verifiableCredential: _convertJwtVcTokenToLdpVcs(
      decodedVpPayloadWithEncodedVcs.verifiableCredential
    )
  };
  return decodedVpPayload;
};

export const normalizeVpTokenDataIntegrity = vpToken => {
  if(typeof vpToken === 'string') {
    try {
      return [JSON.parse(vpToken)];
    } catch(e) {
      return null;
    }
  }

  if(typeof vpToken === 'object' && !Array.isArray(vpToken)) {
    return [vpToken];
  }

  if(Array.isArray(vpToken)) {
    return vpToken.map(item => {
      if(typeof item === 'string') {
        try {
          return JSON.parse(base64url.decode(item));
        } catch(e) {
          console.error('vp_token contains invalid Base64 encoded JSON.');
          return null;
        }
      } else {
        return item;
      }
    });
  }

  console.error('vp_token format is not recognized.');
  return null;
};

// Verify Utilities

const verifyJWTVC = async (jwt, options) => {
  try {
    const vc = await verifyCredentialJWT(jwt, {
      resolve: did => didResolver.get({did})
    }, options);
    if(vc) {
      return {verified: true, vc};
    }
    return {verified: false};
  } catch(e) {
    return {verified: false, errors: [e.message]};
  }
};

const verifyJWTVP = async (jwt, options) => {
  try {
    const vp = await verifyPresentationJWT(jwt, {
      resolve: did => didResolver.get({did})
    }, options);
    if(vp) {
      return {verified: true, vp};
    }
    return {verified: false};
  } catch(e) {
    return {verified: false, errors: [e.message]};
  }
};

export const verifyUtils = {
  verifyPresentationDataIntegrity: async args => verify(args),
  verifyCredentialDataIntegrity: async args => verifyCredential(args),
  verifyPresentationJWT: async (jwt, options) => verifyJWTVP(jwt, options),
  verifyCredentialJWT: async (jwt, options) => verifyJWTVC(jwt, options)
};

// MSAL Client Utilities

const MSAL_ACCESS_TOKEN_REQUEST_SCOPE =
  '3db474b9-6a0c-4840-96ac-1fceb342124f/.default';

const getMsalClient = relyingParty => {
  const {
    apiLoginBaseUrl,
    apiClientId,
    apiClientSecret,
    apiTenantId
  } = relyingParty.workflow;
  const msalConfig = {
    auth: {
      clientId: apiClientId,
      clientSecret: apiClientSecret,
      authority: `${apiLoginBaseUrl}/${apiTenantId}`
    }
  };
  return new ConfidentialClientApplication(msalConfig);
};

const acquireAccessToken = async msalClient => {
  const tokenRequest = {
    scopes: [MSAL_ACCESS_TOKEN_REQUEST_SCOPE],
  };
  return msalClient.acquireTokenByClientCredential(tokenRequest);
};

const makeHttpPostRequest = async ({msalClient, url, data}) => {
  const accessToken = await acquireAccessToken(msalClient);
  const headers = {Authorization: `Bearer ${accessToken}`};
  httpClient.extend({headers});
  return httpClient.post(
    url, {json: data}
  );
};

export const msalUtils = {
  getMsalClient,
  acquireAccessToken,
  makeHttpPostRequest
};
