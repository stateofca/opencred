/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  allowAnyCA,
  extractCertsFromX5C
} from '../../common/x509.js';
import {
  auditUtils,
  getVpTokenMetadata,
} from '../../common/audit.js';
import {
  createId,
  logUtils,
  normalizeVpTokenDataIntegrity,
  unenvelopeJwtVp,
  verifyUtils
} from '../../common/utils.js';
import {importPKCS8, SignJWT} from 'jose';
import {BaseWorkflowService} from './base.js';
import {config} from '@bedrock/core';
import {database} from '../database.js';
import {defaultDocLoader} from '../../common/documentLoader.js';
import {domainToDidWeb} from '../didWeb.js';
import {getAuthorizationRequest} from '../../common/oid4vp.js';
import jp from 'jsonpath';
import {logger} from '../logger.js';
import {sendCallback} from '../callback.js';
import {SUITES} from '../../common/suites.js';
import {updateIssuerDidDocumentHistory} from '../../common/audit.js';

export class NativeWorkflowService extends BaseWorkflowService {
  constructor(app) {
    super(app);
    app.get('/workflows/:workflowId/exchanges/:exchangeId/openid/client/' +
      'authorization/request', this.authorizationRequest.bind(this));
    app.post('/workflows/:workflowId/exchanges/:exchangeId/openid/client/' +
      'authorization/response', this.authorizationResponse.bind(this));
    app.post(
      '/workflows/:workflowId/exchanges/:exchangeId',
      this.submitPresentation.bind(this)
    );
  }

  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    if(trustedVariables.rp?.workflow?.type !== 'native') {
      return;
    }

    const ex = await this.initExchange(trustedVariables, untrustedVariables);
    await database.collections.Exchanges.insertOne(ex);
    return this.formatExchange(ex);
  }

  async verifyJwtSubmission({vp_token, exchange, rp, vcQuery, documentLoader}) {
    const errors = [];
    let verified = true;
    const vp = unenvelopeJwtVp(vp_token);
    const vpResult = await verifyUtils.verifyPresentationJWT(vp_token, {
      audience: domainToDidWeb(config.server.baseUri),
      challenge: exchange.challenge
    });
    if(!vpResult.verified) {
      verified = false;
      errors.push(...vpResult.errors);
    } else {
      const vc = vcQuery ? vcQuery(vpResult.verifiablePresentation) :
        vpResult.verifiablePresentation.verifiableCredential[0];

      if(vc && vc.proof && vc.proof.jwt) {
        const res = await verifyUtils.verifyCredentialJWT(
          vc.proof.jwt,
          {checkStatus: verifyUtils.checkStatus, documentLoader}
        );
        if(!res.verified) {
          errors.push(...res.errors);
        } else {
          // Skips check if there are no trusted CAs defined
          // or if relying party allows any CA
          if(config.opencred.caStore.length > 0 && !allowAnyCA(rp)) {
            const certs = await extractCertsFromX5C(
              res.signer.publicKeyJwk
            );
            if(!certs) {
              errors.push(`Invalid certificate in x5c claim`);
            } else {
              const certValid = await verifyUtils.verifyx509JWT(certs);
              if(!certValid.verified) {
                errors.push(...certValid.errors);
              }
            }
          }
        }
      } else {
        errors.push('VC not found in presentation');
      }
    }
    return {errors, verified, verifiablePresentation: vp};
  }

  /**
   * Verify a submission with linked data proof (LDP)
   * @param {object} options
   * @param {string} options.vp_token
   * @param {object} options.exchange
   * @param {function} options.vcQuery - Function that takes the VP and returns
   * the right VC from within it, based on the query. By default, it will return
   * the first VC in the array.
   * @param {function} options.documentLoader
   * @param {object} options.rp - the relying party config for this submission
   * @returns {object}
   */
  async verifyLdpSubmission({vp_token, exchange, vcQuery, documentLoader, rp}) {
    const errors = [];
    let verified = false;
    const vp = (normalizeVpTokenDataIntegrity(vp_token) ?? [])[0];
    if(vp) {
      const vpResult = await verifyUtils.verifyPresentationDataIntegrity({
        presentation: vp,
        documentLoader,
        suite: SUITES,
        challenge: exchange.challenge,
        checkStatus: verifyUtils.checkStatus
      });
      verified = vpResult.verified;
      if(!vpResult.verified) {
        errors.push(vpResult.error); // TODO check if this is array
      }
      const vc = vcQuery ? vcQuery(vp) : vp.verifiableCredential[0];
      const result = vc.id ? vpResult.credentialResults?.find(
        cr => cr.credentialId === vc.id
      ) : vpResult.credentialResults?.[0];
      if(!result.verified) {
        errors.push(result.error); // TODO check if this is array
        verified = false;
      }
      // TODO: Check if the VC matches the requested credential
      const {
        vpr, dcql_query, presentation_definition
      } = exchange.variables.authorizationRequest;
      if(!verifyUtils.checkVcQueryMatch({
        vc,
        vpr,
        dcql_query,
        presentation_definition
      })) {
        errors.push('Presentation does not match requested credential');
      }
      // TODO: Check if the VC issuer matches trusted issuers.
      const vcIssuer = typeof vc.issuer === 'string' ? vc.issuer : vc.issuer.id;
      if(rp.trustedCredentialIssuers?.length > 0 &&
        !rp.trustedCredentialIssuers.includes(vcIssuer)) {
        errors.push('Unaccepted credential issuer');
      }
    } else {
      errors.push('Unable to normalize vp token to Data Integrity.');
    }
    return {errors, verified, verifiablePresentation: vp};
  }

  async verifySubmission({rp, vp_token, submission, exchange, documentLoader}) {
    const errors = [];
    let verified = false;
    let vp;
    const loader = documentLoader ?? defaultDocLoader;

    const {
      presentation_definition, dcql_query
    } = exchange.variables?.authorizationRequest;

    if(dcql_query?.credentials && !submission) {
      // New in draft 25
      // vp_token will be an object with keys that are the ids of the
      // credential requests in the queries.
      for(const cq of dcql_query.credentials) {
        if(vp_token[cq.id]) {
          if(cq.format === 'jwt_vc_json') {
            /// JWT VP
            const {
              errors: jwtErrors, verified: jwtV, verifiablePresentation
            } = await this.verifyJwtSubmission({
              vp_token: vp_token[cq.id], exchange, rp, documentLoader: loader});
            if(jwtV) {
              verified = true;
              vp = verifiablePresentation;
            }
            errors.push(...jwtErrors);
          } else if(cq.format === 'ldp_vc') {
            // LDP VP
            const {
              errors: lErrors, lV, verifiablePresentation
            } = await this.verifyLdpSubmission({
              documentLoader: loader, vp_token, exchange});
            if(lV) {
              verified = true;
              vp = verifiablePresentation;
            }
            errors.push(...lErrors);
          }
        }
      }
      if(config.opencred.audit.enable) {
        await updateIssuerDidDocumentHistory(vp_token);
      }
      return {errors, verified, verifiablePresentation: vp};
    }

    // Legacy support for OID4VP drafts pre-25
    const {valid, error, issuerDids} = getVpTokenMetadata(vp_token);
    if(!valid) {
      errors.push(error);
    }

    if(rp.trustedCredentialIssuers?.length > 0) {
      if(!issuerDids
        .every(did => rp.trustedCredentialIssuers.includes(did))) {
        errors.push('Unaccepted credential issuer');
      }
    }

    if(presentation_definition?.id && submission &&
        submission.definition_id !== presentation_definition.id) {
      errors.push(`Presentation Definition doesn't match Submission`);
    } else if(submission && submission.descriptor_map.length !==
      presentation_definition.input_descriptors.length) {
      errors.push(`${presentation_definition.input_descriptors.length} ` +
        `Presentation Definition descriptors found and ` +
        `${submission.descriptor_map.length} Presentation Submission ` +
        `descriptors found`);
    }

    if(errors.length) {
      return {errors, verified: false};
    }

    for(const descriptor of presentation_definition.input_descriptors) {
      const submitted = submission.descriptor_map
        .find(d => d.id === descriptor.id);
      if(!submitted) {
        errors.push(`Submission not found for input descriptor`);
      } else if(submitted.format === 'jwt_vp_json') {
        const vpResult = await this.verifyJwtSubmission({
          vp_token, exchange, rp,
          vcQuery: vp => jp.query(vp, submitted.path_nested.path)[0]
        });
        verified = vpResult.verified;
        errors.push(...vpResult.errors);
        vp = vpResult.verifiablePresentation;
      } else if(submitted.format === 'ldp_vp') {
        const vpResult = await this.verifyLdpSubmission({
          vp_token, exchange, rp,
          vcQuery: vp => jp.query(vp, submitted.path_nested.path)[0],
          documentLoader: loader
        });
        verified = vpResult.verified;
        errors.push(...vpResult.errors);
        vp = vpResult.verifiablePresentation;
      } else {
        errors.push(`Format ${submitted.format} not yet supported.`);
      }
    }

    if(errors.length > 0) {
      return {errors, verified: false};
    }
    if(config.opencred.audit.enable) {
      await auditUtils.updateIssuerDidDocumentHistory(vp_token);
    }
    return {errors, verified: true, verifiablePresentation: vp};
  }

  async submitPresentation(req, res, next) {
    const rp = req.rp;
    if(rp?.workflow?.type !== 'native') {
      next();
      return;
    }
    if(rp.workflow.id !== req.params.workflowId) {
      res.status(400).send({message: 'Incorrect workflowId'});
      return;
    }
    try {
      const exchange = await this.getExchange({rp, id: req.params.exchangeId});
      if(exchange) {
        const step = rp.workflow.steps[exchange.step];
        let vpr;
        try {
          vpr = JSON.parse(step.verifiablePresentationRequest);
        } catch(error) {
          logger.error(error.message, {error});
          res.sendStatus(404);
          return;
        }
        res.send({
          verifiablePresentationRequest:
            {
              ...vpr,
              challenge: exchange.challenge
            }
        });
        return;
      } else {
        res.sendStatus(404);
        return;
      }
    } catch(error) {
      logger.error(error.message, {error});
      res.sendStatus(500);
    }
    return;
  }

  processConstraints(constraints, constraintsOverride) {
    if(constraintsOverride) {
      return JSON.parse(constraintsOverride);
    }
    return constraints;
  }

  /**
   * Serves the authorization request for the OpenID4VP protocol
   */
  async authorizationRequest(req, res) {
    const rp = req.rp;
    const exchange = await this.getExchange(
      {rp, id: req.params.exchangeId}
    );

    if(!exchange || exchange?.workflowId !== req.params.workflowId) {
      const errorMessage = 'Exchange not found';
      logUtils.presentationError(rp?.clientId, 'unknown', errorMessage);
      res.status(404).send({message: errorMessage});
      return;
    }
    logUtils.presentationStart(rp?.clientId, exchange?.id);

    if(exchange.state !== 'pending' && exchange.state !== 'active') {
      const errorMessage = `Exchange in state ${exchange.state}`;
      logUtils.presentationError(rp?.clientId, exchange.id, errorMessage);
      res.status(400).send(errorMessage);
      return;
    }

    try {
      const authorizationRequest = await getAuthorizationRequest({
        rp, exchange, domain: config.server.baseUri, url: req.originalUrl});

      await database.collections.Exchanges.updateOne({id: exchange.id}, {
        $set: {
          'variables.authorizationRequest': authorizationRequest,
          state: 'active',
          updatedAt: new Date()
        }
      });

      const key = config.opencred.signingKeys
        .find(k => k.purpose?.includes('authorization_request'));
      if(!key) {
        logger.error('No key with purpose authorization_request found');
        res.sendStatus(500);
        return;
      }
      const {privateKeyPem} = key;
      const privateKey = await importPKCS8(privateKeyPem, key.type);
      const jwt = await new SignJWT(authorizationRequest)
        .setProtectedHeader({
          alg: key.type,
          kid: `${domainToDidWeb(config.server.baseUri)}#${key.id}`,
          typ: 'JWT'
        })
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(privateKey);

      res.set('Content-Type', 'application/oauth-authz-req+jwt');
      res.send(jwt);
    } catch(error) {
      logUtils.presentationError(rp?.clientId, exchange.id, error.message);
      logger.error(error.message, {error});
      res.sendStatus(500);
    }
    return;
  }

  async authorizationResponse(req, res) {
    const rp = req.rp;
    const exchange = await this.getExchange(
      {rp, id: req.params.exchangeId}
    );
    if(!exchange) {
      logUtils.presentationError(rp?.clientId, 'unknown', 'Exchange not found');
      res.sendStatus(404);
      return;
    }
    if(exchange.state !== 'pending' && exchange.state !== 'active') {
      await database.collections.Exchanges.updateOne({
        id: exchange.id
      }, {$set: {state: 'invalid', updatedAt: new Date()}});
      const errorMessage = `Exchange in state ${exchange.state}`;
      logUtils.presentationError(rp?.clientId, exchange.id, errorMessage);
      res.status(400).send(errorMessage);
      return;
    }
    try {
      const submission = typeof req.body.presentation_submission === 'string' ?
        JSON.parse(req.body.presentation_submission) :
        req.body.presentation_submission;
      const {verified, errors, verifiablePresentation} =
        await this.verifySubmission({
          rp, vp_token: req.body.vp_token, submission, exchange
        });
      if(verified) {
        const updatedExchange = {
          ...exchange,
          sequence: exchange.sequence + 1,
          updatedAt: new Date(),
          state: 'complete',
          oidc: {
            code: await createId(),
            state: exchange.oidc?.state
          },
          variables: {
            results: {
              [exchange.step]: {
                verifiablePresentation,
                vpToken: req.body.vp_token
              }
            },
            ...exchange.variables
          }
        };
        const callbackSuccess = await sendCallback(
          rp.workflow,
          updatedExchange,
          exchange.step
        );
        if(!callbackSuccess) {
          const errorMessage = 'Callback failed to send.';
          updatedExchange.state = 'invalid';
          if(updatedExchange.variables.results[exchange.step] === undefined) {
            updatedExchange.variables.results[exchange.step] = {};
          }
          updatedExchange.variables.results[exchange.step].errors = [
            errorMessage
          ];
          await database.collections.Exchanges.replaceOne({
            id: exchange.id
          }, updatedExchange);
          logUtils.presentationError(rp?.clientId, exchange.id, errorMessage);
          // It's ok if wallet interaction is recorded as a success
          res.status(204).send();
          return;
        }
        logUtils.presentationSuccess(rp?.clientId, exchange.id);

        // Update exchange into complete state
        await database.collections.Exchanges.replaceOne({
          id: exchange.id
        }, updatedExchange);

        if(exchange.variables.redirectPath) {
          const redirect_uri =
            `${config.server.baseUri}${exchange.variables.redirectPath}`;
          res.send({redirect_uri});
          return;
        }
        res.sendStatus(204);
        return;
      }

      // Failed verification
      const updatedExchange = {
        ...exchange,
        updatedAt: new Date(),
        state: 'invalid',
        variables: {
          ...exchange.variables,
          results: {[exchange.step]: {errors}}
        }
      };
      await database.collections.Exchanges.replaceOne({
        id: exchange.id
      }, updatedExchange);
      logUtils.presentationError(rp?.clientId, exchange.id, errors.join(', '));
      res.status(400).send({errors});
      return;
    } catch(error) {
      logger.error(error.message, {error});
      logUtils.presentationError(rp?.clientId, exchange.id, error.message);
      res.sendStatus(500);
      return;
    }
  }
}
