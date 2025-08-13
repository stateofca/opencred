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
import {domainToDidWeb} from '../didWeb.js';
import {getDocumentLoader} from '../../common/documentLoader.js';
import jp from 'jsonpath';
import {logger} from '../logger.js';
import {oid4vp} from '@digitalbazaar/oid4-client';
import {sendCallback} from '../callback.js';
import {SUITES} from '../../common/suites.js';

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

  async verifySubmission(vp_token, submission, exchange, documentLoader) {
    let errors = [];
    let vp;
    const loader = documentLoader ?? getDocumentLoader().build();
    const {presentation_definition} = exchange.variables.authorizationRequest;
    const {valid, error, issuerDids} = getVpTokenMetadata(vp_token);
    if(!valid) {
      errors.push(error);
    }
    const rp = config.opencred.relyingParties.find(
      r => r.workflow?.id == exchange.workflowId
    );
    if(!rp) {
      errors.push('Exchange info not found');
    } else if(rp.trustedCredentialIssuers?.length > 0) {
      if(!issuerDids
        .every(did => rp.trustedCredentialIssuers.includes(did))) {
        errors.push('Unaccepted credential issuer');
      }
    }
    const vprJson = rp.workflow.steps[
      rp.workflow.initialStep].verifiablePresentationRequest;
    const vpr = JSON.parse(vprJson);
    if(submission.definition_id !== presentation_definition.id) {
      errors.push(`Presentation Definition doesn't match Submission`);
    } else if(submission.descriptor_map.length !==
      presentation_definition.input_descriptors.length) {
      errors.push(`${presentation_definition.input_descriptors.length} ` +
        `Presentation Definition descriptors found and ` +
        `${submission.descriptor_map.length} Presentation Submission ` +
        `descriptors found`);
    } else if(submission.descriptor_map.length === 0) {
      errors.push(`No descriptors found in Presentation Submission (workflow ` +
        ` ${rp.workflow.id})`);
    } else {
      for(const descriptor of presentation_definition.input_descriptors) {
        const submitted = submission.descriptor_map
          .find(d => d.id === descriptor.id);
        if(!submitted) {
          errors.push(`Submission not found for input descriptor`);
        } else if(submitted.format === 'jwt_vp_json') {
          vp = unenvelopeJwtVp(vp_token);
          const vpResult = await verifyUtils.verifyPresentationJWT(vp_token, {
            audience: domainToDidWeb(config.server.baseUri),
            challenge: exchange.challenge
          });
          if(!vpResult.verified) {
            errors = errors.concat(vpResult.errors);
          } else {
            const vc = jp.query(
              vpResult.verifiablePresentation,
              submitted.path_nested.path
            )[0];
            if(vc && vc.proof && vc.proof.jwt) {
              const res = await verifyUtils.verifyCredentialJWT(
                vc.proof.jwt, {checkStatus: verifyUtils.checkStatus});
              if(!res.verified) {
                errors = errors.concat(res.errors);
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
                      errors = errors.concat(certValid.errors);
                    }
                  }
                }
              }
              if(!verifyUtils.checkVcForVpr(vc, vpr)) {
                errors.push(
                  'VC in presentation does not match presentation request.');
              }
              if(vc.credentialStatus) {
                errors.push('NotImplemented: Credential Status ' +
                  'verification not implemented for JWT format yet.' +
                  'We must treat the credential as invalid for now.');
              }
            } else {
              errors.push('VC not found in presentation');
            }
          }
        } else if(submitted.format === 'ldp_vp') {
          vp = normalizeVpTokenDataIntegrity(vp_token)?.[0];
          if(!vp) {
            errors.push('Unable to normalize vp token to Data Integrity.');
          } else {
            const vpResult = await verifyUtils.verifyPresentationDataIntegrity({
              presentation: vp,
              documentLoader: loader,
              suite: SUITES,
              challenge: exchange.challenge,
              checkStatus: verifyUtils.checkStatus
            });
            errors.push(
              ...verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult)
            );
            const vc = jp.query(vp, submitted.path_nested.path)[0];
            const credentialResult = vc.id ? vpResult.credentialResults?.find(
              cr => cr.credentialId === vc.id
            ) : vpResult.credentialResults?.[0];
            if(!credentialResult) {
              errors.push('No credential found in presentation for ' +
                `descriptor ${submitted.id}`);
            } else {
              const issuer = (typeof vc.issuer === 'string') ?
                vc.issuer : vc.issuer?.id;
              if(rp.trustedCredentialIssuers?.length > 0 && issuer &&
                !rp.trustedCredentialIssuers.includes(issuer)) {
                errors.push('Unaccepted credential issuer');
              }
              if(!verifyUtils.checkVcForVpr(vc, vpr)) {
                errors.push(
                  'VC in presentation does not match presentation request.');
              }
            }

          }

        } else {
          errors.push(`Format ${submitted.format} not yet supported.`);
        }
      }
    }
    if(config.opencred.audit.enable) {
      await auditUtils.updateIssuerDidDocumentHistory(vp_token);
    }
    if(errors.length > 0) {
      return {errors, verified: false};
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

  async authorizationRequest(req, res) {
    const rp = req.rp;
    const exchange = await this.getExchange(
      {rp, id: req.params.exchangeId}
    );
    logUtils.presentationStart(rp?.clientId, exchange?.id);
    if(!exchange || exchange?.workflowId !== req.params.workflowId) {
      const errorMessage = 'Exchange not found';
      logUtils.presentationError(rp?.clientId, 'unknown', errorMessage);
      res.status(404).send({message: errorMessage});
      return;
    }
    if(exchange.state !== 'pending' && exchange.state !== 'active') {
      const errorMessage = `Exchange in state ${exchange.state}`;
      logUtils.presentationError(rp?.clientId, exchange.id, errorMessage);
      res.status(400).send(errorMessage);
      return;
    }
    try {
      const step = rp.workflow.steps[exchange.step];
      const vpr = JSON.parse(step.verifiablePresentationRequest);
      vpr.domain = `${config.server.baseUri}${
        req.originalUrl.replace('request', 'response')}`;
      vpr.challenge = exchange.challenge;
      const fromVPR = oid4vp.fromVpr({
        verifiablePresentationRequest: vpr,
        prefixJwtVcPath: true,
      });
      const input_descriptors = fromVPR.presentation_definition
        .input_descriptors.map(i => {
          return {
            ...i,
            constraints: this.processConstraints(
              i.constraints, step.constraintsOverride),
            format: {
              jwt_vc_json: {
                alg: [
                  'ES256'
                ]
              },
              ldp_vc: {
                proof_type: ['ecdsa-rdfc-2019']
              }
            }
          };
        });
      const authorizationRequest = {
        response_type: 'vp_token',
        response_mode: 'direct_post',
        presentation_definition: {
          ...fromVPR.presentation_definition,
          input_descriptors
        },
        client_id: domainToDidWeb(config.server.baseUri),
        client_id_scheme: 'did',
        nonce: vpr.challenge,
        response_uri: fromVPR.response_uri,
        state: await createId(),
        client_metadata: {
          client_name: 'OpenCred Verifier',
          subject_syntax_types_supported: [
            'did:jwk'
          ],
          vp_formats: {
            jwt_vp_json: {
              alg: [
                'ES256'
              ]
            },
            ldp_vp: {
              proof_type: ['ecdsa-rdfc-2019']
            }
          },
        },
      };
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
        await this.verifySubmission(req.body.vp_token, submission, exchange);
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
