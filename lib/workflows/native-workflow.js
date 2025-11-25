/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
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
  normalizeVpTokenJwt,
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
import {updateIssuerDidDocumentHistory} from '../../common/audit.js';
import {verifyLdpPresentation} from '../../common/vcalm.js';

export class NativeWorkflowService extends BaseWorkflowService {

  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    if(trustedVariables.rp?.type !== 'native') {
      return;
    }

    const ex = await this.initExchange(trustedVariables, untrustedVariables);
    await database.collections.Exchanges.insertOne(ex);
    return this.formatExchange(ex, {rp: trustedVariables.rp});
  }

  getProtocols({exchange}) {
    const domain = config.server.baseUri;
    const {id, workflowId} = exchange;
    const baseUrl = `${domain}/workflows/${workflowId}/exchanges/${id}`;
    const authzReqUrl = `${baseUrl}/openid/client/authorization/request`;
    const clientId = domainToDidWeb(domain);

    const buildOpenId4VpUrl = profile => {
      const requestUri = profile ?
        `${authzReqUrl}?profile=${profile}` : authzReqUrl;
      const searchParams = new URLSearchParams({
        client_id: clientId,
        request_uri: requestUri
      });
      return 'openid4vp://?' + searchParams.toString();
    };

    return {
      ...super.getProtocols({exchange}),
      vcapi: baseUrl,
      OID4VP: buildOpenId4VpUrl('OID4VP-combined'),
      'OID4VP-draft18': buildOpenId4VpUrl('OID4VP-draft18'),
      'OID4VP-1.0': buildOpenId4VpUrl('OID4VP-1.0')
    };
  }

  async verifyJwtSubmission({vp_token, exchange, rp, vcQuery, documentLoader,
    presentation_submission}) {
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
      let vc = vcQuery ? vcQuery(vp) :
        vpResult.verifiablePresentation.verifiableCredential[0];

      // If vcQuery returned undefined, try fallback to vpResult
      if(!vc && vcQuery) {
        vc = vcQuery(vpResult.verifiablePresentation);
      }

      // Handle JWT string VCs (from vpResult.verifiablePresentation)
      const vcJwt = typeof vc === 'string' ? vc : (vc?.proof?.jwt);

      if(vcJwt) {
        const res = await verifyUtils.verifyCredentialJWT(
          vcJwt,
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

      // Check if the VC matches the requested credential
      if(vc) {
        const {
          vpr, dcql_query, presentation_definition
        } = exchange.variables.authorizationRequest;
        if(!verifyUtils.checkVcQueryMatch({
          vc,
          vpr,
          dcql_query,
          presentation_definition,
          presentation_submission
        })) {
          errors.push('Presentation does not match requested credential');
          verified = false;
        }
      }
    }
    return {errors, verified, verifiablePresentation: vp};
  }

  /**
   * Classifies which OID4VP interoperability profile is being used
   * @param {object} options
   * @param {object} options.submission - The presentation_submission
   * (if present)
   * @param {object} options.dcql_query - The dcql_query from authorization
   * request
   * @returns {string|null} - 'oid4vp-draft18', 'oid4vp-1.0', or null if
   * unable to determine
   */
  classifyOID4VPSubmission({submission, dcql_query}) {
    // Draft 18: Uses presentation_submission with descriptor_map
    if(submission) {
      return 'oid4vp-draft18';
    }

    // OID4VP 1.0: Uses vp_token object keyed by dcql query ids (no submission)
    if(dcql_query?.credentials && Array.isArray(dcql_query.credentials) &&
      dcql_query.credentials.length > 0) {
      return 'oid4vp-1.0';
    }

    // Unable to determine format
    return null;
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
  async verifyLdpSubmission({vp_token, exchange, vcQuery, documentLoader,
    rp, presentation_submission}) {
    const errors = [];
    let verified = false;
    const vp = (normalizeVpTokenDataIntegrity(vp_token) ?? [])[0];
    if(vp) {
      const verificationResult = await verifyLdpPresentation({
        presentation: vp,
        exchange,
        vcQuery,
        documentLoader
      });
      verified = verificationResult.verified;
      errors.push(...verificationResult.errors);
      const vc = verificationResult.vc;
      // TODO: Check if the VC matches the requested credential
      const {
        vpr, dcql_query, presentation_definition
      } = exchange.variables.authorizationRequest;
      if(!verifyUtils.checkVcQueryMatch({
        vc,
        vpr,
        dcql_query,
        presentation_definition,
        presentation_submission
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

  /**
   * Verify an OID4VP 1.0 format submission
   * Handles vp_token as object keyed by dcql query ids
   * @param {object} options
   * @param {object} options.rp - The relying party config
   * @param {object} options.vp_token - Object keyed by dcql query ids:
   * {"<dcql_query.credentials.id>": [<vp>]}
   * @param {object} options.exchange - The exchange object
   * @param {function} options.documentLoader - Document loader function
   * @returns {object} - {errors, verified, verifiablePresentation}
   */
  async verifyOID4VPSubmission({rp, vp_token, exchange, documentLoader}) {
    const errors = [];
    let verified = false;
    let vp;
    const loader = documentLoader ?? defaultDocLoader;

    const {
      dcql_query
    } = exchange.variables?.authorizationRequest;

    // vp_token will be an object with keys that are the ids of the
    // credential requests in the queries.
    for(const cq of dcql_query.credentials) {
      if(vp_token[cq.id]) {
        if(cq.format === 'jwt_vc_json') {
          // JWT VP
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
            documentLoader: loader, vp_token: vp_token[cq.id], exchange, rp});
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

  /**
   * Verify a Draft 18 format submission
   * Handles presentation_submission with descriptor_map
   * @param {object} options
   * @param {object} options.rp - The relying party config
   * @param {object} options.vp_token - The VP token
   * @param {object} options.submission - The presentation_submission object
   * @param {object} options.exchange - The exchange object
   * @param {function} options.documentLoader - Document loader function
   * @returns {object} - {errors, verified, verifiablePresentation}
   */
  async verifyDraft18Submission({rp, vp_token, submission, exchange,
    documentLoader}) {
    const errors = [];
    let verified = false;
    let vp;
    const loader = documentLoader ?? defaultDocLoader;

    const {
      presentation_definition
    } = exchange.variables?.authorizationRequest;

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

    if(!submission) {
      errors.push('Presentation submission is required');
      return {errors, verified: false};
    }

    for(const descriptor of presentation_definition.input_descriptors) {
      const submitted = submission.descriptor_map
        .find(d => d.id === descriptor.id);
      if(!submitted) {
        errors.push(`Submission not found for input descriptor`);
        verified = false;
      } else if(submitted.format === 'jwt_vp_json') {
        // Normalize vp_token to handle both plain JWT strings and
        // JSON-stringified JWT strings (per OID4VP Draft 18 ambiguity)
        const normalizedVpToken = normalizeVpTokenJwt(vp_token);
        const vpResult = await this.verifyJwtSubmission({
          vp_token: normalizedVpToken, exchange, rp,
          vcQuery: vp => jp.query(vp, submitted.path_nested.path)[0],
          presentation_submission: submission
        });
        verified = vpResult.verified;
        errors.push(...vpResult.errors);
        vp = vpResult.verifiablePresentation;
      } else if(submitted.format === 'ldp_vp') {
        const vpResult = await this.verifyLdpSubmission({
          vp_token, exchange, rp,
          vcQuery: vp => jp.query(vp, submitted.path_nested.path)[0],
          documentLoader: loader,
          presentation_submission: submission
        });
        verified = vpResult.verified;
        errors.push(...vpResult.errors);
        vp = vpResult.verifiablePresentation;
      } else {
        errors.push(`Format ${submitted.format} not yet supported.`);
        verified = false;
      }
    }

    if(errors.length > 0) {
      return {errors, verified: false};
    }
    if(config.opencred.audit.enable) {
      await auditUtils.updateIssuerDidDocumentHistory(vp_token);
    }
    return {errors, verified, verifiablePresentation: vp};
  }

  /**
   * Verify a submission - dispatches to appropriate verification function
   * based on OID4VP format (Draft 18 or 1.0)
   * @param {object} options
   * @param {object} options.rp - The relying party config
   * @param {object} options.vp_token - The VP token
   * @param {object} options.submission - The presentation_submission (optional)
   * @param {object} options.exchange - The exchange object
   * @param {function} options.documentLoader - Document loader function
   * @returns {object} - {errors, verified, verifiablePresentation}
   */
  async verifySubmission({rp, vp_token, submission, exchange, documentLoader}) {
    const {
      dcql_query
    } = exchange.variables?.authorizationRequest || {};

    // Classify which OID4VP format is being used
    const format = this.classifyOID4VPSubmission({
      submission,
      dcql_query
    });

    if(format === 'oid4vp-1.0') {
      return this.verifyOID4VPSubmission({
        rp,
        vp_token,
        exchange,
        documentLoader
      });
    }

    if(format === 'oid4vp-draft18') {
      return this.verifyDraft18Submission({
        rp,
        vp_token,
        submission,
        exchange,
        documentLoader
      });
    }

    // Unable to determine format
    return {
      errors: [
        'Unable to determine OID4VP format. ' +
        'Either presentation_submission or dcql_query.credentials ' +
        'must be provided.'
      ],
      verified: false
    };
  }

  async participateInExchangeMiddleware(req, res, next) {
    const rp = req.rp;
    if(rp?.type !== 'native') {
      next();
      return;
    }
    if(rp.clientId !== req.params.workflowId) {
      res.status(400).send({message: 'Incorrect workflowId'});
      return;
    }

    const exchange = req.exchange;
    if(!exchange) {
      res.sendStatus(404);
      return;
    }

    if(exchange.state !== 'pending' && exchange.state !== 'active') {
      const errorMessage = `Participation disallowed: Exchange in state ${
        exchange.state}`;
      logUtils.presentationError(rp?.clientId, exchange.id, errorMessage);
      res.status(400).send({message: errorMessage});
      return;
    }

    try {
      // Detect request type: check if verifiablePresentation is present
      const hasVerifiablePresentation =
        req.body?.verifiablePresentation !== undefined &&
        req.body?.verifiablePresentation !== null;

      if(!hasVerifiablePresentation) {
        // Case 1: Empty body or {} - return verifiablePresentationRequest
        let vpr;
        try {
          vpr = JSON.parse(rp.verifiablePresentationRequest);
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
      }
      // Case 2: Verify presentation
      // Extract verifiablePresentation from body (may be JSON string or object)
      let vpToken = req.body.verifiablePresentation;
      if(typeof vpToken === 'string') {
        try {
          vpToken = JSON.parse(vpToken);
        } catch(error) {
          // If parsing fails, return 400 error
          res.status(400).send({
            title: 'PARSING_ERROR',
            detail: 'Could not parse verifiablePresentation format'
          });
          return;
        }
      }

      // Verify the LDP presentation directly
      const verificationResult = await verifyLdpPresentation({
        presentation: vpToken,
        exchange
      });

      const {verified, errors, verifiablePresentation, vc} = verificationResult;
      const allErrors = [...errors];

      if(verified && vc) {
        // Check VPR match
        let vpr;
        try {
          vpr = JSON.parse(rp.verifiablePresentationRequest);
        } catch(error) {
          logger.error(error.message, {error});
          allErrors.push('Invalid verifiablePresentationRequest configuration');
        }

        if(vpr && !verifyUtils.checkVcForVpr(vc, vpr)) {
          allErrors.push('Presentation does not match requested credential');
        }

        // Check issuer against trusted issuers
        if(rp.trustedCredentialIssuers?.length > 0) {
          const vcIssuer = typeof vc.issuer === 'string' ?
            vc.issuer : vc.issuer.id;
          if(!rp.trustedCredentialIssuers.includes(vcIssuer)) {
            allErrors.push('Unaccepted credential issuer');
          }
        }
      }

      if(verified && allErrors.length === 0) {
        // Success: update exchange and send callback
        const updatedExchange = await this.handleVerifiedSubmission({
          exchange,
          verifiablePresentation,
          vpToken: req.body.verifiablePresentation
        });
        await this.processCallback({
          rp,
          updatedExchange
        });
        // Respond with 200 OK and {} body (not redirect_uri)
        res.status(200).send({});
        return;
      }

      // Failed verification: update exchange to invalid state
      const updatedExchange = {
        ...exchange,
        updatedAt: new Date(),
        state: 'invalid',
        variables: {
          ...exchange.variables,
          results: {[exchange.step]: {errors: allErrors}}
        }
      };
      await database.collections.Exchanges.replaceOne({
        id: exchange.id
      }, updatedExchange);
      logUtils.presentationError(rp?.clientId, exchange.id,
        allErrors.join(', '));
      res.status(400).send({errors: allErrors});
      return;
    } catch(error) {
      logger.error(error.message, {error});
      logUtils.presentationError(rp?.clientId, req.exchange?.id, error.message);
      res.sendStatus(500);
      return;
    }
  }

  processConstraints(constraints, constraintsOverride) {
    if(constraintsOverride) {
      return JSON.parse(constraintsOverride);
    }
    return constraints;
  }

  /**
   * Handles a verified submission by creating an updated exchange
   * @param {object} options
   * @param {object} options.exchange - The current exchange
   * @param {object} options.verifiablePresentation - The verified presentation
   * @param {string|object} options.vpToken - The VP token
   * @returns {object} The updated exchange object
   */
  async handleVerifiedSubmission({exchange, verifiablePresentation,
    vpToken}) {
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
            vpToken
          }
        },
        ...exchange.variables
      }
    };
    return updatedExchange;
  }

  /**
   * Processes the callback for a verified submission
   * @param {object} options
   * @param {object} options.rp - The relying party config
   * @param {object} options.updatedExchange - The updated exchange object
   * @returns {Promise<object>} Object with success flag and response data
   */
  async processCallback({rp, updatedExchange}) {
    const callbackSuccess = await sendCallback(rp, updatedExchange);
    if(!callbackSuccess) {
      const errorMessage = 'Callback failed to send.';
      updatedExchange.state = 'invalid';
      const step = updatedExchange.step;
      if(updatedExchange.variables.results[step] === undefined) {
        updatedExchange.variables.results[step] = {};
      }
      updatedExchange.variables.results[step].errors = [errorMessage];
      await database.collections.Exchanges.replaceOne({
        id: updatedExchange.id
      }, updatedExchange);
      logUtils.presentationError(
        rp?.clientId, updatedExchange.id, errorMessage);
      return {success: false, statusCode: 204};
    }
    logUtils.presentationSuccess(rp?.clientId, updatedExchange.id);

    // Update exchange into complete state
    await database.collections.Exchanges.replaceOne({
      id: updatedExchange.id
    }, updatedExchange);

    // TODO: we need to remove the setting of redirectPath in the variables
    // with replaceExchange and handle the use case without replacing exchange.
    // The need is to send the wallet back to the opencred page but only if the
    // user engaged in a same-device flow.
    if(updatedExchange.variables.redirectPath) {
      const redirect_uri =
        `${config.server.baseUri}${updatedExchange.variables.redirectPath}`;
      return {success: true, statusCode: 200, redirect_uri};
    }
    return {success: true, statusCode: 204};
  }

  /**
   * Serves the authorization request for the OpenID4VP protocol
   */
  async authorizationRequestMiddleware(req, res, next) {
    const rp = req.rp;
    if(rp?.type !== 'native') {
      next();
      return;
    }
    const exchange = req.exchange;

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
      // Extract profile query parameter (defaults to OID4VP-combined)
      const profile = req.query.profile ||
        config.opencred.options.OID4VPdefault;
      const authorizationRequest = await getAuthorizationRequest({
        rp,
        exchange,
        domain: config.server.baseUri,
        url: req.originalUrl,
        profile
      });

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

  async authorizationResponseMiddleware(req, res, next) {
    const rp = req.rp;
    if(rp?.type !== 'native') {
      next();
      return;
    }
    const exchange = req.exchange;
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
        const updatedExchange = await this.handleVerifiedSubmission({
          exchange,
          verifiablePresentation,
          vpToken: req.body.vp_token
        });
        const callbackResult = await this.processCallback({
          rp,
          updatedExchange
        });
        // It's ok if wallet interaction is recorded as a success
        // even if callback fails (status 204)
        if(callbackResult.redirect_uri) {
          res.send({redirect_uri: callbackResult.redirect_uri});
          return;
        }
        res.status(callbackResult.statusCode).send();
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
