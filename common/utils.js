import {verify, verifyCredential} from '@digitalbazaar/vc';
import base64url from 'base64url';
import {ConfidentialClientApplication} from '@azure/msal-node';
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

const _convertJwtVcTokenToW3cVcs = vcTokens => {
  return vcTokens.map(t => _decodeJwtPayload(t).vc);
};

export const convertJwtVpTokenToW3cVp = vpToken => {
  const decodedVpPayloadWithEncodedVcs = _decodeJwtPayload(vpToken).vp;
  const decodedVpPayload = {
    ...decodedVpPayloadWithEncodedVcs,
    verifiableCredential: _convertJwtVcTokenToW3cVcs(
      decodedVpPayloadWithEncodedVcs.verifiableCredential
    )
  };
  return decodedVpPayload;
};

// Verify Utilities

export const verifyUtils = {
  verify: async args => verify(args),
  verifyCredential: async args => verifyCredential(args)
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
