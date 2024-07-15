/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  convertJwtVpTokenToDiVp,
  createId
} from '../../common/utils.js';
import {BaseWorkflowService} from './base.js';
import {config} from '@bedrock/core';
import {database} from '../database.js';
import {logger} from '../logger.js';
import {msalUtils} from '../../common/utils.js';
import {sendCallback} from '../callback.js';
import {updateIssuerDidDocumentHistory} from '../../common/audit.js';

// Microsoft Entra Verified ID Workflow Middleware

// Domain of values for requestStatus property in verification callback request
const VerificationStatus = {
  RequestRetrieved: 'request_retrieved',
  PresentationVerified: 'presentation_verified',
  PresentationError: 'presentation_error'
};

export class EntraVerifiedIdWorkflowService extends BaseWorkflowService {
  constructor(app) {
    super(app);
    app.post('/verification/callback', this.verificationCallback.bind(this));
  }

  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    const {rp, accessToken, oidc} = trustedVariables;
    if(rp?.workflow?.type !== 'microsoft-entra-verified-id') {
      return;
    }
    const workflow = rp.workflow;
    const workflowId = workflow.id;
    const {
      apiBaseUrl,
      verifierDid,
      verifierName,
      steps,
      initialStep
    } = workflow;
    const {acceptedCredentialType} = steps[initialStep];
    const defaults = {
      credentialVerificationCallbackAuthEnabled: true,
      acceptedCredentialIssuers: undefined,
      credentialVerificationPurpose: 'To check permission to access resources',
      allowRevokedCredentials: false,
      validateLinkedDomain: false
    };
    const {
      credentialVerificationCallbackAuthEnabled,
      acceptedCredentialIssuers,
      credentialVerificationPurpose,
      allowRevokedCredentials,
      validateLinkedDomain
    } = {...defaults, ...workflow};
    const baseUri = config.server.baseUri;
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
        url: `${baseUri}/verification/callback`,
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
    let response;
    try {
      response = await msalUtils.makeHttpPostRequest({
        msalClient,
        url: `${apiBaseUrl}/verifiableCredentials/createPresentationRequest`,
        data: verificationPayload
      });
    } catch(e) {
      logger.error(e);
      throw new Error('Unable to create exchange with Entra');
    }

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
    const now = Date.now();
    const ttl = Math.floor((expiry * 1000 - now) / 1000);
    let variables = {};
    if(
      untrustedVariables &&
      rp.workflow.untrustedVariableAllowList
    ) {
      variables = this.parseUntrustedVariables(
        rp.workflow.untrustedVariableAllowList,
        untrustedVariables
      );
    }
    await database.collections.Exchanges.insertOne({
      id: requestId,
      workflowId,
      sequence: 0,
      ttl,
      state: 'pending',
      variables,
      step: initialStep,
      accessToken,
      createdAt: new Date(now),
      recordExpiresAt: new Date(now + 86400000 + (ttl * 1000)),
      oidc
    });

    const vcapi = `${baseUri}/workflows/${workflowId}/exchanges/${requestId}`;
    const queryString = url.split('?')[1];
    const params = new URLSearchParams(queryString);
    const requestUri = params.get('request_uri');
    const OID4VP =
      `openid4vp://?request_uri=${requestUri}&client_id=${verifierDid}`;
    const exchange = {
      id: requestId, vcapi, OID4VP, accessToken, oidc, workflowId
    };
    return this.formatExchange(exchange);
  }

  async verificationCallback(req, res) {
    // NOTE: Since we do not receive the state back from
    // the immediate credential verification response,
    // we were not able to correlate it with an exchange.
    // Hence, we cannot use this and instead use requestId.
    const requestId = req.body.requestId;
    const verificationStatus = req.body.requestStatus;
    const receipt = req.body.receipt;
    const accessToken = req.headers.authorization;
    if(!requestId) {
      res.status(400).send({message: 'requestId is required.'});
      return;
    }

    const exchange = await database.collections.Exchanges.findOne(
      {id: requestId},
      {projection: {_id: 0}}
    );

    const rp = config.opencred.relyingParties.find(
      r => r.workflow?.id === exchange.workflowId
    );

    if(rp.workflow.credentialVerificationCallbackAuthEnabled) {
      if(!accessToken) {
        res.status(401).send({message: 'Authorization header is required.'});
        return;
      }
      if(exchange.accessToken !== accessToken) {
        res.status(401).send({message: 'Invalid access token'});
        return;
      }
    }
    let exchangeState; let message;
    switch(verificationStatus) {
      case VerificationStatus.RequestRetrieved:
        exchangeState = 'active';
        message = 'Credential verification is active';
        break;
      case VerificationStatus.PresentationVerified:
        exchangeState = 'complete';
        message = 'Credential verification is complete';
        break;
      case VerificationStatus.PresentationError:
        exchangeState = 'invalid';
        message = 'Credential verification has encountered error';
        break;
      default:
        exchangeState = 'invalid';
        message = 'Unrecognized verification status';
    }

    const vpToken = receipt?.vp_token;
    const now = Date.now();
    let results = {};
    if(req.body.error) {
      results.error = req.body.error;
    }
    const {initialStep} = rp.workflow;
    if(typeof vpToken === 'object') {
      results = {
        [initialStep]: {
          verifiablePresentation: vpToken,
          vpToken
        }
      };
    } else if(typeof vpToken === 'string') {
      const diVp = convertJwtVpTokenToDiVp(vpToken);
      results = {
        [initialStep]: {
          verifiablePresentation: diVp,
          vpToken
        }
      };
    }
    const updatedExchange = {
      ...exchange,
      state: exchangeState,
      variables: {
        ...exchange.variables,
        results
      },
      ...(exchangeState === 'complete' ?
        {'oidc.code': await createId()} : {}
      ),
      updatedAt: new Date(now)
    };
    if(exchangeState === 'complete') {
      const callbackSuccess = await sendCallback(
        rp.workflow,
        updatedExchange,
        initialStep
      );
      if(!callbackSuccess) {
        await database.collections.Exchanges.updateOne({id: exchange.id}, {
          $set: {
            state: 'invalid',
            variables: {
              ...exchange.variables,
              results: {
                [exchange.step]: {
                  errors: ['Callback failed to send.']
                }
              }
            }
          }});
        // It's ok if wallet interaction is recorded as a success
        res.status(204).send();
        return;
      }
    }

    await database.collections.Exchanges.replaceOne({
      id: requestId
    }, updatedExchange);

    if(config.opencred.audit.enable) {
      await updateIssuerDidDocumentHistory(vpToken);
    }

    res.status(exchangeState === 'invalid' ? 400 : 200).send({message});
  }
}
