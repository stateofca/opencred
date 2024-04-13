/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  convertJwtVpTokenToDiVp,
  createId,
  normalizeVpTokenDataIntegrity
} from '../../common/utils.js';
import {importPKCS8, SignJWT} from 'jose';
import {config} from '@bedrock/core';
import {domainToDidWeb} from '../didWeb.js';

import {database} from '../database.js';
import {extractCertsFromX5C} from '../../common/x509.js';
import {getDocumentLoader} from '../../common/documentLoader.js';
import jp from 'jsonpath';
import {logger} from '../logger.js';
import {oid4vp} from '@digitalbazaar/oid4-client';
import {SUITES} from '../../common/suites.js';
import {updateIssuerDidDocumentHistory} from '../../common/audit.js';
import {verifyUtils} from '../../common/utils.js';

const formatExchange = exchange => {
  if(!exchange) {
    return null;
  }
  const id = exchange.id;
  const accessToken = exchange.accessToken;
  const workflowId = exchange.workflowId;
  const oidc = exchange.oidc;
  const domain = config.server.baseUri;
  const vcapi = `${domain}/workflows/${workflowId}/exchanges/${id}`;
  const authzReqUrl = `${vcapi}/openid/client/authorization/request`;
  const searchParams = new URLSearchParams({
    client_id: domainToDidWeb(config.server.baseUri),
    request_uri: authzReqUrl
  });
  const OID4VP = 'openid4vp://?' + searchParams.toString();
  return {id, vcapi, OID4VP, accessToken, workflowId, oidc};
};

export const getExchange = async ({params, allowExpired} = {
  params: {}, allowExpired: false
}) => {
  const exchange = await database.collections.Exchanges.findOne(
    params, {projection: {_id: 0}}
  );
  if(!exchange) {
    return null;
  }
  if(!allowExpired) {
    const expiry = new Date(exchange.createdAt.getTime() + exchange.ttl * 1000);
    if(new Date() > expiry) {
      return null;
    }
  }
  return exchange;
};

export const createExchange = async (
  workflow, oidcState = '', redirectUrl = null
) => {
  const id = await createId();
  const workflowId = workflow.id;
  const accessToken = await createId();
  const challenge = await createId();
  const createdAt = new Date();
  const ttl = 60 * 15;
  const oidc = {
    code: null,
    state: oidcState
  };
  const variables = redirectUrl ? {redirectUrl} : {};
  const exchange = {
    id,
    workflowId,
    sequence: 0,
    ttl,
    state: 'pending',
    variables,
    step: workflow.initialStep,
    challenge,
    accessToken,
    createdAt,
    recordExpiresAt: new Date(createdAt.getTime() + 86400000 + (ttl * 1000)),
    oidc
  };
  await database.collections.Exchanges.insertOne(exchange);
  return formatExchange(exchange);
};

export const createNativeExchange = async (req, res, next) => {
  const rp = req.rp;
  if(!rp || !rp.workflow || rp.workflow.type !== 'native') {
    next();
    return;
  }
  req.exchange = await createExchange(
    rp.workflow, req.query.state, req.body?.redirectUrl ?? null
  );
  next();
};

export const getOrCreateNativeExchange = async (req, res, next) => {
  const {exchangeId, accessToken} = req.cookies;
  if(!(exchangeId && accessToken)) {
    return createNativeExchange(req, res, next);
  }
  const exchange = await getExchange({
    params: {
      id: exchangeId,
      accessToken
    }
  });
  if(exchange) {
    req.exchange = formatExchange(exchange);
  }
  next();
};

export const verifySubmission = async (vp_token, submission, exchange) => {
  let errors = [];
  let vp;
  const documentLoader = getDocumentLoader().build();
  const {presentation_definition} = exchange.variables.authorizationRequest;
  if(submission.definition_id !== presentation_definition.id) {
    errors.push(`Presentation Definition doesn't match Submission`);
  } else if(submission.descriptor_map.length !==
    presentation_definition.input_descriptors.length) {
    errors.push(`${presentation_definition.input_descriptors.length} ` +
      `Presentation Definition descriptors found and ` +
      `${submission.descriptor_map.length} Presentation Submission ` +
      `descriptors found`);
  } else {
    for(const descriptor of presentation_definition.input_descriptors) {
      const submitted = submission.descriptor_map
        .find(d => d.id === descriptor.id);
      if(!submitted) {
        errors.push(`Submission not found for input descriptor`);
      } else if(submitted.format === 'jwt_vp_json') {
        vp = convertJwtVpTokenToDiVp(vp_token);
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
            const result = await verifyUtils.verifyCredentialJWT(vc.proof.jwt);
            if(!result.verified) {
              errors = errors.concat(result.errors);
            } else {
              if(config.opencred.caStore.length > 0) {
                const certs = await extractCertsFromX5C(
                  result.signer.publicKeyJwk
                );
                if(!certs) {
                  errors = errors.concat(`Invalid certificate in x5c claim`);
                } else {
                  const certValid = await verifyUtils.verifyx509JWT(certs);
                  if(!certValid.verified) {
                    errors = errors.concat(certValid.errors);
                  }
                }
              }
            }
          } else {
            errors = errors.concat('VC not found in presentation');
          }
        }
      } else if(submitted.format === 'ldp_vp') {
        vp = normalizeVpTokenDataIntegrity(vp_token)[0];
        const vpResult = await verifyUtils.verifyPresentationDataIntegrity({
          presentation: vp,
          documentLoader,
          suite: SUITES,
          challenge: exchange.challenge
        });
        if(!vpResult.verified) {
          errors.push(vpResult.error);
        }
        const vc = jp.query(vp, submitted.path_nested.path)[0];
        const result = await verifyUtils.verifyCredentialDataIntegrity({
          credential: vc,
          documentLoader,
          suite: SUITES,
        });
        if(!result.verified) {
          errors.push(result.error);
        }
      } else {
        errors.push(`Format ${submitted.format} not yet supported.`);
      }
    }
  }
  if(config.opencred.enableAudit) {
    await updateIssuerDidDocumentHistory(vp_token);
  }
  if(errors.length > 0) {
    return {errors, verified: false};
  }
  return {errors, verified: true, verifiablePresentation: vp};
};

export default function(app) {
  app.post('/workflows/:workflowId/exchanges', createNativeExchange);

  app.get('/context/login', getOrCreateNativeExchange);

  app.get('/workflows/:workflowId/exchanges/:exchangeId', async (req, res,
    next) => {
    const rp = req.rp;
    if(!rp || !rp.workflow || rp.workflow.type !== 'native') {
      next();
      return;
    }
    if(!req.exchange) {
      req.exchange = await getExchange({
        params: {
          id: req.params.exchangeId
        },
        allowExpired: true
      });
    }
    next();
  });

  app.get('/workflows/:workflowId/exchanges/:exchangeId/openid/client/' +
    'authorization/request', async (req, res) => {
    const exchange = await getExchange({params: {id: req.params.exchangeId}});
    if(!exchange || exchange?.workflowId !== req.params.workflowId) {
      res.status(404).send({message: 'Exchange not found'});
      return;
    }
    if(exchange.state !== 'pending') {
      res.status(400).send(`Exchange in state ${exchange.state}`);
      return;
    }
    try {
      const step = req.rp.workflow.steps[exchange.step];

      const vpr = JSON.parse(step.verifiablePresentationRequest);
      vpr.domain = `${config.server.baseUri}${
        req.originalUrl.replace('request', 'response')}`;
      vpr.challenge = exchange.challenge;
      const fromVPR = oid4vp.fromVpr({
        verifiablePresentationRequest: vpr,
        prefixVC: true
      });
      const input_descriptors = fromVPR.presentation_definition
        .input_descriptors.map(i => {
          return {
            ...i,
            constraints: step.constraintsOverride ?
              JSON.parse(step.constraintsOverride) : i.constraints,
            format: {
              jwt_vc_json: {
                alg: [
                  'ES256'
                ]
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
            jwt_vc: {
              alg: [
                'ES256'
              ]
            }
          },
        },
      };

      await database.collections.Exchanges.updateOne({id: exchange.id}, {
        $set: {
          'variables.authorizationRequest': authorizationRequest,
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
      logger.error(error.message, {error});
      res.sendStatus(500);
    }
    return;
  });

  app.post('/workflows/:workflowId/exchanges/:exchangeId/openid/client/' +
    'authorization/response', async (req, res) => {
    const exchange = await getExchange({params: {id: req.params.exchangeId}});
    if(!exchange) {
      res.sendStatus(404);
      return;
    }

    if(exchange.state !== 'pending') {
      await database.collections.Exchanges.updateOne({
        id: exchange.id
      }, {$set: {state: 'invalid', updatedAt: new Date()}});
      res.status(400).send(`Exchange in state ${exchange.state}`);
      return;
    }
    try {
      const submission = typeof req.body.presentation_submission === 'string' ?
        JSON.parse(req.body.presentation_submission) :
        req.body.presentation_submission;
      const {verified, errors, verifiablePresentation} = await verifySubmission(
        req.body.vp_token, submission, exchange
      );
      if(verified) {
        const update = {
          $inc: {sequence: 1},
          $set: {
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
                },
              },
              ...exchange.variables
            }
          }
        };
        await database.collections.Exchanges.updateOne({
          id: exchange.id,
          state: 'pending'
        }, update);
        if(exchange.variables.redirectUrl) {
          res.send({redirect_uri: exchange.variables.redirectUrl});
          return;
        }
        res.sendStatus(204);
        return;
      }
      res.status(400).send({errors});
      return;
    } catch(error) {
      logger.error(error.message, {error});
      res.sendStatus(500);
      return;
    }
  });

  app.post('/workflows/:workflowId/exchanges/:exchangeId', async (req, res) => {
    if(req.rp.workflow.id !== req.params.workflowId) {
      res.status(400).send({message: 'Incorrect workflowId'});
      return;
    }
    try {
      const exchange = await getExchange({params: {id: req.params.exchangeId}});
      if(exchange) {
        const step = req.rp.workflow.steps[exchange.step];
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
  });
}
