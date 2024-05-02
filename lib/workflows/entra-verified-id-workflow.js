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

  async createExchange(req, res, next) {
    const rp = req.rp;
    if(
      !rp ||
      !rp.workflow ||
      rp.workflow.type !== 'microsoft-entra-verified-id'
    ) {
      next();
      return;
    }
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
    const oidc = {
      code: null,
      state: req.query?.state ?? req.body?.oidcState ?? ''
    };
    let variables = {};
    if(
      (req.query?.variables || req.body?.variables) &&
      rp.workflow.untrustedVariableAllowList
    ) {
      variables = this.parseUntrustedVariables(
        rp.workflow.untrustedVariableAllowList,
        req.query?.variables ?? req.body?.variables
      );
    }
    await database.collections.Exchanges.insertOne({
      id: requestId,
      workflowId,
      sequence: 0,
      ttl,
      state: 'pending',
      variables,
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
    req.exchange = this.formatExchange(exchange);
    next();
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
    const exchange = await database.collections.Exchanges.findOne(
      {id: requestId},
      {projection: {_id: 0}}
    );

    const rp = config.opencred.relyingParties.find(
      r => r.workflow?.id === exchange.workflowId
    );

    if(rp.workflow.credentialVerificationCallbackAuthEnabled) {
      if(!accessToken) {
        res.status(401).send({message: 'Authorization header is required'});
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
        exchangeState = 'pending';
        message = 'Credential verification is pending';
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
    if(typeof vpToken === 'object') {
      const results = {
        final: {
          verifiablePresentation: vpToken,
          vpToken
        }
      };
      if(req.body.error) {
        results.error = req.body.error;
      }
      await database.collections.Exchanges.updateOne({
        id: requestId
      }, {$set: {
        state: exchangeState,
        'variables.results': results,
        ...(exchangeState === 'complete' ?
          {'oidc.code': await createId()} : {}
        ),
        updatedAt: new Date(now)
      }});
    } else if(typeof vpToken === 'string') {
      const diVp = convertJwtVpTokenToDiVp(vpToken);
      const results = {
        final: {
          verifiablePresentation: diVp,
          vpToken
        }
      };
      if(req.body.error) {
        results.error = req.body.error;
      }
      await database.collections.Exchanges.updateOne({
        id: requestId
      }, {$set: {
        state: exchangeState,
        'variables.results': results,
        ...(exchangeState === 'complete' ?
          {'oidc.code': await createId()} : {}
        ),
        updatedAt: new Date(now)
      }});
    } else {
      const results = {};
      if(req.body.error) {
        results.error = req.body.error;
      }
      await database.collections.Exchanges.updateOne({
        id: requestId
      }, {$set: {
        state: exchangeState,
        'variables.results': results,
        updatedAt: new Date(now)
      }});
    }

    if(config.opencred.enableAudit) {
      await updateIssuerDidDocumentHistory(vpToken);
    }

    res.status(exchangeState === 'invalid' ? 400 : 200).send({message});
  }
}