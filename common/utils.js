import {verify, verifyCredential} from '@digitalbazaar/vc';
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

export const ensureValue = (optionalValue, defaultValue) => {
  return optionalValue !== undefined ? optionalValue : defaultValue;
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
    apiBaseUrl,
    apiClientId,
    apiClientSecret,
    apiTenantId
  } = relyingParty.workflow;
  const msalConfig = {
    auth: {
      clientId: apiClientId,
      clientSecret: apiClientSecret,
      authority: `${apiBaseUrl}/${apiTenantId}`
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