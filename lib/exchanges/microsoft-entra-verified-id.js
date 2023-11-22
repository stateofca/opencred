/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  convertJwtVpTokenToLdpVp,
  createId
} from '../../common/utils.js';
import {config} from '@bedrock/core';
import {database} from '../database.js';
import {msalUtils} from '../../common/utils.js';

// Microsoft Entra Verified ID Workflow Middleware

// Domain of values for requestStatus property in verification callback request
const VerificationStatus = {
  RequestRetrieved: 'request_retrieved',
  PresentationVerified: 'presentation_verified'
};

const createExchangeHelper = async (rp, oidcState = null) => {
  const workflow = rp.workflow;
  const workflowId = workflow.id;
  const {
    apiBaseUrl,
    verifierDid,
    verifierName,
    acceptedCredentialType,
  } = workflow;

  const defaults = {
    credentialVerificationCallbackAuthEnabled: true,
    acceptedCredentialIssuers: undefined,
    credentialVerificationPurpose: 'To check permission to access resources',
    allowRevokedCredentials: false,
    validateLinkedDomain: true
  };
  const {
    credentialVerificationCallbackAuthEnabled,
    acceptedCredentialIssuers,
    credentialVerificationPurpose,
    allowRevokedCredentials,
    validateLinkedDomain
  } = {...defaults, ...workflow};
  const domain = config.domain;
  const accessToken = await createId();
  // NOTE: Since we do not receive the state back from
  // the immediate credential verification response,
  // we are not able to correlate it with an exchange.
  // Hence, we cannot use this and instead use requestId.
  // However, this is a required field in the API, so we must use it.
  const state = await createId();

  const verificationPayload = {
    includeQRCode: false,
    includeReceipt: true,
    authority: verifierDid,
    registration: {
      clientName: verifierName
    },
    callback: {
      url: `${domain}/verification/callback`,
      state,
      ...(credentialVerificationCallbackAuthEnabled && {
        headers: {
          Authorization: accessToken
        }
      })
    },
    requestedCredentials: [
      {
        type: acceptedCredentialType,
        purpose: credentialVerificationPurpose,
        acceptedIssuers: acceptedCredentialIssuers,
        configuration: {
          validation: {
            allowRevoked: allowRevokedCredentials,
            validateLinkedDomain
          }
        }
      }
    ]
  };

  const msalClient = msalUtils.getMsalClient(rp);
  const response = await msalUtils.makeHttpPostRequest({
    msalClient,
    url: `${apiBaseUrl}/verifiableCredentials/createPresentationRequest`,
    data: verificationPayload
  });

  const {data} = response;
  if(data.error) {
    const {requestId, error} = data;
    const {code: outerCode, message: outerMessage, innererror} = error;
    const {code: innerCode, message: innerMessage, target} = innererror;
    throw new Error(
      `Request ID - ${requestId}\n    ` +
      `[${outerCode}] ${outerMessage}\n    ` +
      `[${innerCode}${target ? ' - ' + target : ''}] ${innerMessage}\n`
    );
  }

  const {requestId, url, expiry} = data;
  const createdAt = Date.now();
  const ttl = Math.floor((expiry - createdAt) / 1000);
  const oidc = {
    code: null,
    state: oidcState
  };
  await database.collections.Exchanges.insertOne({
    id: requestId,
    workflowId,
    sequence: 0,
    ttl,
    state: 'pending',
    accessToken,
    createdAt,
    recordExpiresAt: new Date(createdAt + 86400000 + (ttl * 1000)),
    oidc
  });

  const vcapi = `${domain}/workflows/${workflowId}/exchanges/${requestId}`;
  return {id: requestId, vcapi, OID4VP: url, accessToken, workflowId, oidc};
};

const createExchange = async (req, res, next) => {
  const rp = req.rp;
  if(
    !rp ||
    !rp.workflow ||
    rp.workflow.type !== 'microsoft-entra-verified-id'
  ) {
    next();
    return;
  }
  try {
    req.exchange = await createExchangeHelper(rp, req.query.state ?? null);
  } catch(error) {
    res.status(500).send({
      message: 'Error creating exchange:\n' + error.message
    });
    return;
  }
  next();
};

const verificationCallback = async (req, res) => {
  const authHeader = req.headers.authorization;
  // NOTE: Since we do not receive the state back from
  // the immediate credential verification response,
  // we were not able to correlate it with an exchange.
  // Hence, we cannot use this and instead use requestId.
  const requestId = req.body.requestId;
  const verificationStatus = req.body.requestStatus;
  const receipt = req.body.receipt;
  const [authType, authValue] = authHeader ?
    authHeader.split(' ') :
    [undefined, undefined];

  let exchange;
  if(authValue) {
    exchange = await database.collections.Exchanges.findOne(
      {id: requestId},
      {projection: {_id: 0}}
    );
  }
  const rp = config.opencred.relyingParties.find(
    r => r.workflow?.id == exchange.workflowId
  );
  if(!exchange) {
    res.status(401).send({message: 'Unauthorized to access this resource'});
    return;
  }

  if(rp.workflow.credentialVerificationCallbackAuthEnabled) {
    if(!authHeader) {
      res.status(401).send({message: 'Authorization header is required'});
      return;
    }
    if(authType !== 'Bearer' || !authValue) {
      res.status(401).send({message: 'Invalid authorization format'});
      return;
    }
    if(exchange.accessToken !== authValue) {
      res.status(401).send({message: 'Invalid access token'});
      return;
    }
  }

  let exchangeState; let message;
  switch(verificationStatus) {
    case VerificationStatus.RequestRetrieved:
      exchangeState = 'pending';
      message = 'Credential verification is pending';
      break;
    case VerificationStatus.PresentationVerified:
      exchangeState = 'complete';
      message = 'Credential verification is complete';
      break;
    default:
      exchangeState = 'invalid';
      message = 'Unrecognized verification status';
  }

  const vpToken = receipt?.vp_token;
  if(typeof vpToken === 'object') {
    await database.collections.Exchanges.updateOne({
      id: requestId,
      state: exchangeState
    }, {$set: {
      'variables.results.final': {
        verifiablePresentation: vpToken
      },
      ...(exchangeState === 'complete' ? {'oidc.code': await createId()} : {}),
      updatedAt: Date.now()
    }});
  } else if(typeof vpToken === 'string') {
    const ldpVp = convertJwtVpTokenToLdpVp(vpToken);
    await database.collections.Exchanges.updateOne({
      id: requestId,
      state: exchangeState
    }, {$set: {
      'variables.results.final': {
        verifiablePresentation: ldpVp
      },
      ...(exchangeState === 'complete' ? {'oidc.code': await createId()} : {}),
      updatedAt: Date.now()
    }});
  } else {
    await database.collections.Exchanges.updateOne({
      id: requestId,
      state: 'invalid'
    }, {$set: {
      updatedAt: Date.now()
    }});
  }

  res.status(exchangeState === 'invalid' ? 400 : 200).send({message});
};

export default function(app) {
  app.get('/context//login', createExchange);

  app.post('/workflows/:workflowId/exchanges', createExchange);

  app.get('/workflows/:workflowId/exchanges/:exchangeId',
    async (req, res, next) => {
      const rp = req.rp;
      if(
        !rp ||
        !rp.workflow ||
        rp.workflow.type !== 'microsoft-entra-verified-id'
      ) {
        next();
        return;
      }
      if(!req.exchange) {
        req.exchange = await database.collections.Exchanges.findOne({
          id: req.params.exchangeId
        });
      }
      next();
    });

  app.post('/verification/callback', verificationCallback);
}
