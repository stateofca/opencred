/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {
  authorizationRequestForProfile,
  authorizationResponseForProfile
} from './common/oid4vp-dispatcher.js';
import {
  BaseWorkflowService, resolveExchangeExpires
} from './base.js';
import {
  buildExchangeResultToken, handleVerifiedPresentation, resolveSuccessViewFields
} from './common.js';
import {
  buildPendingRequest,
  hasResponseState,
  hydratePendingRequest,
  readPendingRequests
} from './common/dc-api-pending-requests.js';
import {
  clientIdForProfile,
  profileSupportsRequestUriMethodPost
} from '../../common/oid4vp-utils.js';
import {
  getVerifiablePresentationRequest,
  handleVerifiablePresentation
} from './profiles/native-vcapi.js';
import {
  importPKCS8, SignJWT
} from 'jose';
import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {database} from '../database.js';
import {domainToDidWeb} from '../didWeb.js';
import {findWorkflow} from '../resolveClient.js';
import {getRegisteredRedirectUris} from '../redirect-uri.js';
import {identifyProfiles} from './common/identify-profile.js';
import {isDcApiProfile} from './common/dc-api-envelope.js';
import {logger} from '../logger.js';
import {logUtils} from '../../common/utils.js';
import {OID4VP_AUTHZ_REQ_JWT_TYP} from './common/oid4vp.js';
import {responseProtocol} from './common/dc-api-response-resolver.js';
import {sendCallback} from '../callback.js';

/**
 * Strip the spent pending DC API requests from an exchange about to be
 * persisted.
 *
 * Once a wallet has answered, the pending requests are spent and their key
 * material is dead weight. Removing them leaves exactly the flat variables
 * shape a completed exchange has always had, so callbacks, audit, and the
 * success view see no change from multi-profile support.
 *
 * @param {object} updatedExchange - Exchange returned by a response handler.
 * @returns {object} The exchange without `variables.dcApiRequests`.
 */
function _withoutPendingRequests(updatedExchange) {
  if(!updatedExchange?.variables?.dcApiRequests) {
    return updatedExchange;
  }
  // eslint-disable-next-line no-unused-vars
  const {dcApiRequests, ...variables} = updatedExchange.variables;
  return {...updatedExchange, variables};
}

export class NativeWorkflowService extends BaseWorkflowService {

  async getExchange({
    id, accessToken, allowExpired = false
  } = {}) {
    const exchange = await super.getExchange({id, accessToken, allowExpired});
    if(!exchange) {
      return null;
    }

    // Scrub DC API session data from exchange (server-side only)
    if(exchange.variables?.dcApiSession) {
      // eslint-disable-next-line no-unused-vars
      const {dcApiSession, ...restVariables} = exchange.variables;
      exchange.variables = restVariables;
    }

    // Scrub pending DC API requests: each entry carries the ephemeral private
    // key material used to decrypt that request's response, which must never
    // leave the server.
    if(exchange.variables?.dcApiRequests) {
      // eslint-disable-next-line no-unused-vars
      const {dcApiRequests, ...restVariables} = exchange.variables;
      exchange.variables = restVariables;
    }

    // Check if exchange has expired and mark as invalid if so
    // Only check if state is "active" or "pending"
    // (not "complete" or already "invalid")
    if(exchange.state === 'active' || exchange.state === 'pending') {
      const expires = resolveExchangeExpires({exchange});
      if(expires && new Date() > expires.getTime()) {
        // Exchange has expired - mark as invalid and add error
        exchange.state = 'invalid';
        const stepName = exchange.step || 'default';

        // Ensure variables.results structure exists
        if(!exchange.variables) {
          exchange.variables = {};
        }
        if(!exchange.variables.results) {
          exchange.variables.results = {};
        }
        if(!exchange.variables.results[stepName]) {
          exchange.variables.results[stepName] = {};
        }
        if(!Array.isArray(exchange.variables.results[stepName].errors)) {
          exchange.variables.results[stepName].errors = [];
        }

        // Append expiration error without overwriting existing errors
        const expirationError = 'The exchange has expired.';
        const errors = exchange.variables.results[stepName].errors;
        if(!errors.includes(expirationError)) {
          errors.push(expirationError);
        }
      }
    }

    return exchange;
  }

  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    if(trustedVariables.workflow?.type !== 'native') {
      return;
    }

    const ex = await this.initExchange(trustedVariables, untrustedVariables);
    await database.collections.Exchanges.insertOne(ex);
    return this.formatExchange({
      exchange: ex,
      workflow: trustedVariables.workflow
    });
  }

  async formatExchange({exchange, includeQR = false, workflow} = {}) {
    const formatted = await super.formatExchange({
      exchange, includeQR, workflow
    });
    if(!formatted) {
      return formatted;
    }
    // The DC API authorization request endpoint, published directly.
    //
    // `protocols` holds `openid4vp://` deep links, which is the right shape for
    // QR and link interaction but not for the DC API: a DC API launch needs to
    // call the endpoint itself, with one `profile` parameter per profile the
    // button requests. Deriving that from a deep link means parsing
    // `request_uri` back out of a query string, and there is no way to express
    // several profiles that way at all.
    const {id, workflowId} = exchange;
    formatted.dcApi = {
      authorizationRequestUrl:
        `${config.server.baseUri}/workflows/${workflowId}/exchanges/${id}` +
        '/openid/client/authorization/request'
    };
    return formatted;
  }

  getProtocols({exchange, workflow} = {}) {
    const domain = config.server.baseUri;
    const {id, workflowId} = exchange;
    const baseUrl = `${domain}/workflows/${workflowId}/exchanges/${id}`;
    const authzReqUrl = `${baseUrl}/openid/client/authorization/request`;

    const buildOpenId4VpUrl = profile => {
      const requestUri = profile ?
        `${authzReqUrl}?profile=${profile}` : authzReqUrl;
      const clientId = clientIdForProfile({profile, domain});
      const searchParams = new URLSearchParams({
        client_id: clientId,
        request_uri: requestUri
      });
      if(profileSupportsRequestUriMethodPost(profile)) {
        searchParams.set('request_uri_method', 'post');
      }
      return 'openid4vp://?' + searchParams.toString();
    };

    const oid4vpDefault =
      config.opencred?.options?.OID4VPdefault || 'OID4VP-combined';

    const protocols = {
      ...super.getProtocols({exchange, workflow}),
      vcapi: baseUrl,
      OID4VP: buildOpenId4VpUrl(oid4vpDefault),
      'OID4VP-combined': buildOpenId4VpUrl('OID4VP-combined'),
      'OID4VP-draft18': buildOpenId4VpUrl('OID4VP-draft18'),
      'OID4VP-1.0': buildOpenId4VpUrl('OID4VP-1.0')
    };

    // Add 18013-7-Annex-D protocol if workflow query includes mso_mdoc format
    if(workflowId) {
      const workflow = findWorkflow(
        config.opencred.workflows ?? [], workflowId
      );
      if(workflow?.query) {
        // Check if any query item has mso_mdoc in its format array
        const hasMsoMdoc = workflow.query.some(item => {
          const formats = item.format || [];
          return Array.isArray(formats) && formats.includes('mso_mdoc');
        });
        if(hasMsoMdoc) {
          protocols['cadmv-android'] =
            buildOpenId4VpUrl('cadmv-android');
          protocols['cadmv-ios'] =
            buildOpenId4VpUrl('cadmv-ios');
          protocols['18013-7-Annex-D'] = buildOpenId4VpUrl('18013-7-Annex-D');
          protocols['18013-7-Annex-C'] = buildOpenId4VpUrl('18013-7-Annex-C');
          const hasGoogleWalletCert =
            config.opencred.walletCertificates?.some(
              e => e.wallet === 'google-wallet'
            );
          if(hasGoogleWalletCert) {
            protocols['google-wallet'] =
              buildOpenId4VpUrl('google-wallet');
          }
          const hasAppleWalletCert =
            config.opencred.walletCertificates?.some(
              e => e.wallet === 'apple-wallet'
            );
          if(hasAppleWalletCert) {
            protocols['apple-wallet'] =
              buildOpenId4VpUrl('apple-wallet');
          }
        }
      }
    }

    return protocols;
  }

  async participateInExchangeMiddleware(req, res, next) {
    const workflow = req.workflow;
    if(workflow?.type !== 'native') {
      next();
      return;
    }
    if(req.exchange && req.exchange.workflowId !== workflow.clientId) {
      res.status(400).send({message: 'Incorrect workflowId'});
      return;
    }

    const exchange = req.exchange;
    if(!exchange) {
      res.sendStatus(404);
      return;
    }
    const userAgent = req.headers['user-agent'];

    if(exchange.state !== 'pending' && exchange.state !== 'active') {
      const errorMessage = `Participation disallowed: Exchange in state ${
        exchange.state}`;
      logUtils.presentationError(
        workflow?.clientId, exchange.id, errorMessage, userAgent);
      res.status(400).send({message: errorMessage});
      return;
    }

    try {
      if(!req.body.verifiablePresentation) {
        // Case 1: Empty body or {} - return verifiablePresentationRequest
        const domain = config.server.baseUri;
        const url = req.url;
        const vpr = await getVerifiablePresentationRequest({
          workflow, exchange, domain, url
        });
        res.send({
          verifiablePresentationRequest: vpr
        });
        return;
      }

      // Case 2: Verify presentation
      // Extract verifiablePresentation from body (may be JSON string or object)
      // Note: only LDP VPs are supported for now - JWTs must be submitted as
      // EnvelopedVerifiablePresentations etc.
      let vpToken = req.body.verifiablePresentation;
      if(typeof vpToken === 'string') {
        try {
          vpToken = JSON.parse(vpToken);
        } catch {
          // If parsing fails, return 400 error
          res.status(400).send({
            title: 'PARSING_ERROR',
            detail: 'Could not parse verifiablePresentation. JSON expected.'
          });
          return;
        }
      }

      const {
        verified, errors: allErrors, verifiablePresentation
      } = await handleVerifiablePresentation({
        workflow, exchange, vpToken
      });

      if(verified) {
        // Success: update exchange and send callback
        const updatedExchange = await handleVerifiedPresentation({
          exchange,
          verifiablePresentation,
          vpToken: req.body.verifiablePresentation
        });
        await this.processCallback({
          workflow,
          updatedExchange,
          userAgent
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
      logUtils.presentationError(workflow?.clientId, exchange.id,
        allErrors.join(', '), userAgent);
      res.status(400).send({errors: allErrors});
      return;
    } catch(error) {
      // TODO update exchange with errors and state: invalid.
      logger.error(error.message, {error});
      logUtils.presentationError(
        workflow?.clientId, req.exchange?.id, error.message, userAgent);
      res.sendStatus(500);
      return;
    }
  }

  /**
   * Processes the callback for a verified submission.
   *
   * @param {object} options - Options for processing callback.
   * @param {object} options.workflow - The workflow config.
   * @param {object} options.updatedExchange - The updated exchange object.
   * @param {string} [options.userAgent] - User-Agent of the triggering
   *   request, for event logging.
   * @param {string} [options.requestGroupId] - Correlates the terminal event
   *   with the authorization request call that issued the answered request.
   * @returns {Promise<object>} Object with success flag and response data.
   */
  async processCallback({
    workflow, updatedExchange, userAgent, requestGroupId
  }) {
    // The resolved profile: `updatedExchange` came from the response handler,
    // which was given the hydrated pending request, so this is the profile that
    // actually answered.
    const profile = updatedExchange.variables?.profile;
    const callbackDelivered =
      await sendCallback(workflow, updatedExchange, {userAgent});
    if(!callbackDelivered) {
      const errorMessage = 'Callback failed to send.';
      updatedExchange.state = 'invalid';
      const step = updatedExchange.step;
      if(updatedExchange.variables?.results &&
          updatedExchange.variables.results?.[step] === undefined) {
        updatedExchange.variables.results[step] = {};
      }
      updatedExchange.variables.results[step].errors = [errorMessage];
      await database.collections.Exchanges.replaceOne({
        id: updatedExchange.id
      }, updatedExchange);
      logUtils.presentationError(
        workflow?.clientId, updatedExchange.id, errorMessage, userAgent,
        profile, requestGroupId);
      return {success: false, statusCode: 204};
    }
    // Log presentation outcome based on verification result
    if(updatedExchange.state === 'complete') {
      logUtils.presentationSuccess(
        workflow?.clientId, updatedExchange.id, userAgent, profile,
        requestGroupId);
    } else {
      const errors =
        updatedExchange.variables?.results?.[updatedExchange.step]?.errors;
      const errorMessage = Array.isArray(errors) ?
        errors.join(', ') : 'Verification failed';
      logUtils.presentationError(
        workflow?.clientId, updatedExchange.id, errorMessage, userAgent,
        profile, requestGroupId);
    }

    // Update exchange into complete state
    await database.collections.Exchanges.replaceOne({
      id: updatedExchange.id
    }, updatedExchange);

    return {success: true, statusCode: 200};
  }

  /**
   * Serves the authorization request for the OpenID4VP protocol.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   */
  async authorizationRequestMiddleware(req, res, next) {
    const {exchange, workflow} = req;
    if(workflow?.type !== 'native') {
      next();
      return;
    }
    const userAgent = req.headers['user-agent'];

    if(!exchange || exchange?.workflowId !== req.workflow?.clientId) {
      const errorMessage = 'Exchange not found';
      logUtils.presentationError(
        workflow?.clientId, 'unknown', errorMessage, userAgent);
      res.status(404).send({message: errorMessage});
      return;
    }

    if(exchange.state !== 'pending' && exchange.state !== 'active') {
      const errorMessage = `Exchange in state ${exchange.state}`;
      logUtils.presentationError(
        workflow?.clientId, exchange.id, errorMessage, userAgent);
      res.status(400).send(errorMessage);
      return;
    }

    try {
      // Handle POST requests per OID4VP 1.0 Section 5.10
      const isPost = req.method === 'POST';
      let walletNonce = null;

      if(isPost) {
        // Validate Content-Type header for POST requests
        const contentType = req.headers['content-type'];
        if(!contentType ||
           !contentType.includes('application/x-www-form-urlencoded')) {
          const errorMessage =
            'Content-Type must be application/x-www-form-urlencoded';
          logUtils.presentationError(
            workflow?.clientId, exchange.id, errorMessage, userAgent);
          res.status(400).send({message: errorMessage});
          return;
        }

        // Validate Accept header for POST requests (JSON envelope or legacy
        // JAR response type per wallet capability)
        const accept = req.headers.accept;
        const acceptOk = accept && (
          accept.includes('application/oauth-authz-req+jwt') ||
          accept.includes('application/json'));
        if(!acceptOk) {
          const errorMessage =
            'Accept header must include application/json or ' +
            'application/oauth-authz-req+jwt';
          logUtils.presentationError(
            workflow?.clientId, exchange.id, errorMessage, userAgent);
          res.status(406).send({message: errorMessage});
          return;
        }

        // Parse wallet_metadata and wallet_nonce from POST body
        // wallet_metadata is parsed for validation but not currently used
        if(req.body.wallet_metadata) {
          try {
            JSON.parse(req.body.wallet_metadata);
          } catch {
            const errorMessage = 'Invalid JSON in wallet_metadata';
            logUtils.presentationError(
              workflow?.clientId, exchange.id, errorMessage, userAgent);
            res.status(400).send({message: errorMessage});
            return;
          }
        }
        walletNonce = req.body.wallet_nonce || null;
      }

      // Step 1: Identify the requested profile(s) and response mode.
      // Support both GET (req.query) and POST (req.body) for these parameters.
      // `profile` may repeat: the DC API can carry several authorization
      // requests in one `navigator.credentials.get()` call, so one wallet
      // answers the request it understands while another answers its own.
      const queryParams = isPost ? req.body : req.query;
      const resolvedProfiles = identifyProfiles({
        profile: queryParams.profile,
        responseMode: queryParams.response_mode,
        clientIdScheme: queryParams.client_id_scheme,
        workflow
      });
      const isMultiProfile = resolvedProfiles.length > 1;

      // A multi-profile request can only contain DC API profiles. The
      // standard/draft-18 fallback below responds with a bare signed JAR JWT
      // body under `application/oauth-authz-req+jwt`, which cannot be one
      // element of a JSON array of envelopes. Single-profile requests are
      // unaffected and still serve every profile.
      if(isMultiProfile) {
        const nonDcApi = resolvedProfiles
          .filter(p => !isDcApiProfile({profile: p.profile}))
          .map(p => p.profile);
        if(nonDcApi.length > 0) {
          const errorMessage =
            'A multi-profile authorization request may only contain DC API ' +
            `profiles; ${nonDcApi.join(', ')} cannot be combined with others.`;
          logUtils.presentationError(
            workflow?.clientId, exchange.id, errorMessage, userAgent);
          res.status(400).send({
            message: errorMessage, error: 'PROFILE_NOT_DC_API'
          });
          return;
        }
      }

      // Correlates every request issued by this call, and whichever response
      // eventually answers one of them, in the event log.
      const requestGroupId = await createId();

      logUtils.presentationStart(
        workflow?.clientId, exchange?.id,
        resolvedProfiles.map(p => p.profile), userAgent, requestGroupId);

      // Step 2: Generate an authorization request per profile.
      // `variables` is snapshotted before any handler runs so each handler's
      // additions can be lifted into its own pending-request entry; a
      // handler is free to write through to the same object.
      const variablesBefore = {...(exchange.variables ?? {})};
      const built = [];
      const failures = [];
      for(const resolved of resolvedProfiles) {
        try {
          built.push({
            resolved,
            result: await authorizationRequestForProfile({
              profile: resolved.profile,
              responseMode: resolved.responseMode,
              clientIdScheme: resolved.clientIdScheme,
              workflow,
              exchange,
              requestUrl: req.originalUrl,
              userAgent,
              walletNonce,
              signed: resolved.signed
            })
          });
        } catch(error) {
          // Preserve single-profile behavior exactly: let the outer catch
          // produce the same status, error code, and body it always has.
          if(!isMultiProfile) {
            throw error;
          }
          failures.push({profile: resolved.profile, error});
        }
      }

      // Strict all-or-nothing. Dropping a profile that failed to build — a
      // missing wallet certificate, say — would turn a misconfiguration into a
      // wallet that silently never appears, with nothing in the response to say
      // why. Nothing is persisted.
      if(failures.length > 0) {
        for(const {profile: failedProfile, error} of failures) {
          logUtils.presentationError(
            workflow?.clientId, exchange.id, error.message || 'Unknown error',
            userAgent, failedProfile, requestGroupId);
        }
        const first = failures[0].error;
        res.status(first.statusCode || 500).send({
          message:
            'One or more profiles in the multi-profile authorization request ' +
            'could not be served: ' +
            failures.map(
              f => `${f.profile}: ${f.error.message || 'Unknown error'}`
            ).join('; '),
          error: first.errorCode || 'INTERNAL_ERROR',
          profiles: failures.map(f => ({
            profile: f.profile,
            message: f.error.message || 'Unknown error',
            error: f.error.errorCode || 'INTERNAL_ERROR'
          }))
        });
        return;
      }

      const dcApiBuilt = built.filter(b => b.result?.dcApiRequest);

      // In-house DC API profiles (Annex C, Annex D, HAIP, SpruceID) return a
      // ready-to-send wire envelope. Persist every pending request in a single
      // write, then respond with all of them.
      if(dcApiBuilt.length > 0 && dcApiBuilt.length === built.length) {
        const pendingRequests = dcApiBuilt.map(({resolved, result}) =>
          buildPendingRequest({
            profile: resolved.profile,
            requestGroupId,
            variablesBefore,
            variablesAfter: result.updatedExchange?.variables
          }));

        // Assert each entry carries what its response handler will need,
        // hydrated exactly as the response side will hydrate it. A handler
        // that produced neither an `authorizationRequest` nor a `dcApiSession`
        // would otherwise persist an entry that fails 20 seconds later as a
        // wallet response error; fail the request loudly instead. Hydrating
        // (rather than reading `entry.authorizationRequest`) accepts the
        // SpruceID retry path, where an existing `dcApiSession` is present
        // without being new material.
        for(const entry of pendingRequests) {
          const {variables} = hydratePendingRequest({
            exchange: {variables: variablesBefore},
            entry
          });
          if(!hasResponseState({variables})) {
            const error = new Error(
              `Pending authorization request for profile ` +
              `"${entry.profile}" is missing the state its response handler ` +
              `requires (authorizationRequest or dcApiSession).`);
            error.statusCode = 500;
            error.errorCode = 'DC_API_PENDING_REQUEST_INCOMPLETE';
            throw error;
          }
        }

        // One write carrying all pending requests. Sequential per-profile
        // writes would lose each other's state, since every handler derives
        // its result from the same input exchange.
        const updatedExchange = {
          ...exchange,
          state: 'active',
          updatedAt: new Date(),
          variables: {
            ...variablesBefore,
            dcApiRequests: pendingRequests
          }
        };
        await database.collections.Exchanges.replaceOne(
          {id: exchange.id},
          updatedExchange
        );

        for(const {resolved} of dcApiBuilt) {
          logUtils.presentationRequestServed({
            clientId: workflow?.clientId, exchangeId: exchange.id,
            profile: resolved.profile, responseMode: resolved.responseMode,
            wire: 'dcApiRequest', userAgent, requestGroupId
          });
        }

        res.set('Content-Type', 'application/json');
        const dcApiRequests = dcApiBuilt.map(({resolved, result}) => ({
          profile: resolved.profile,
          dcApiRequest: result.dcApiRequest
        }));
        res.json({
          dcApiRequests,
          // Retained for a single requested profile so existing clients, the
          // audit script, and the bedrock tests see an unchanged response.
          ...(dcApiRequests.length === 1 ?
            {dcApiRequest: dcApiRequests[0].dcApiRequest} : {})
        });
        return;
      }

      // Single non-DC-API profile: fall through to the JAR JWT path below.
      const {resolved: {profile, responseMode}, result} = built[0];
      const {authorizationRequest, updatedExchange, signingMetadata} = result;

      // Standard / draft-18 fallback path: middleware still signs the JAR JWT
      // because those profiles haven't been migrated to the dcApiRequest
      // contract yet.

      // Step 3: Sign JWT
      const signingKey = config.opencred.signingKeys
        .find(k => k.purpose?.includes('authorization_request'));
      if(!signingKey) {
        logger.error('No key with purpose authorization_request found');
        res.sendStatus(500);
        return;
      }

      const privateKey = await importPKCS8(
        signingKey.privateKeyPem, signingKey.type);

      // Use signing metadata if provided (for Annex-D handlers),
      // otherwise use defaults
      const protectedHeader = signingMetadata ? {
        alg: signingMetadata.alg,
        kid: signingMetadata.kid,
        typ: OID4VP_AUTHZ_REQ_JWT_TYP,
        ...(signingMetadata.x5c && signingMetadata.x5c.length > 0 ?
          {x5c: signingMetadata.x5c} :
          {})
      } : {
        alg: signingKey.type,
        kid: `${domainToDidWeb(config.server.baseUri)}#${signingKey.id}`,
        typ: OID4VP_AUTHZ_REQ_JWT_TYP
      };

      const jwt = await new SignJWT(authorizationRequest)
        .setProtectedHeader(protectedHeader)
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(privateKey);

      // Step 4: Persist exchange
      await database.collections.Exchanges.replaceOne(
        {id: exchange.id},
        updatedExchange
      );

      // Step 5: Return response
      logUtils.presentationRequestServed({
        clientId: workflow?.clientId, exchangeId: exchange.id,
        profile, responseMode, wire: 'jar-jwt', userAgent
      });
      res.set('Content-Type', 'application/oauth-authz-req+jwt');
      res.send(jwt);
    } catch(error) {
      const errorMessage = error.message || 'Unknown error';
      logUtils.presentationError(
        workflow?.clientId, exchange.id, errorMessage, userAgent);
      logger.error(errorMessage, {error});
      const statusCode = error.statusCode || 500;
      const errorCode = error.errorCode || 'INTERNAL_ERROR';
      res.status(statusCode).send({
        message: errorMessage,
        error: errorCode
      });
    }
    return;
  }

  // Accepts the raw DC API credentialResponse object — see
  // lib/workflows/common/dc-api-envelope.js#unwrapDcApiOid4vpResponse for the
  // unwrap procedure.
  async authorizationResponseMiddleware(req, res, next) {
    const workflow = req.workflow;
    if(workflow?.type !== 'native') {
      next();
      return;
    }
    const userAgent = req.headers['user-agent'];
    const exchange = req.exchange;
    if(!exchange) {
      logUtils.presentationError(
        workflow?.clientId, 'unknown', 'Exchange not found', userAgent);
      res.sendStatus(404);
      return;
    }
    if(exchange.state !== 'pending' && exchange.state !== 'active') {
      await database.collections.Exchanges.updateOne({
        id: exchange.id
      }, {$set: {state: 'invalid', updatedAt: new Date()}});
      const errorMessage = `Exchange in state ${exchange.state}`;
      logUtils.presentationError(
        workflow?.clientId, exchange.id, errorMessage, userAgent);
      res.status(400).send(errorMessage);
      return;
    }
    // Emitted on arrival, before any processing, so that "a response arrived"
    // stays measurable against "a response succeeded" even when processing
    // fails. Which profile answered is therefore not known yet — that is
    // carried by the terminal `presentation_success` / `presentation_error`,
    // which read the resolved profile off the handler's exchange. The response
    // protocol and the request group are both available without resolving.
    const arrivalPending = readPendingRequests({exchange});
    logUtils.presentationResponseReceived(
      workflow?.clientId, exchange.id, userAgent, {
        protocol: responseProtocol(req.body),
        requestGroupId: arrivalPending[0]?.requestGroupId ?? undefined
      });
    try {
      // Step 1: Call profile-specific handler.
      // Handler selection and pending-request resolution are both internal to
      // authorizationResponseForProfile.
      const responseUrl = `${config.server.baseUri}${req.originalUrl}`;
      const {
        updatedExchange, requestGroupId
      } = await authorizationResponseForProfile({
        workflow,
        exchange,
        responseUrl,
        responseBody: req.body,
        // A hint only — the resolver never lets it override the protocol match.
        declaredProfile: req.query?.profile
      });

      // Step 3: Persist exchange to database. The pending requests are spent
      // once one of them has been answered, so they are dropped here; what
      // remains is the flat shape a completed exchange has always had.
      await database.collections.Exchanges.replaceOne(
        {id: exchange.id},
        _withoutPendingRequests(updatedExchange)
      );
      // Step 4: Handle callback processing
      const callbackResult = await this.processCallback({
        workflow,
        updatedExchange,
        userAgent,
        requestGroupId
      });

      // Step 5: Return response based on callback result
      if(callbackResult.success) {
        const procedurePath = updatedExchange.variables?.procedurePath ??
          (getRegisteredRedirectUris({workflow}).length > 0 ?
            'login' : 'verification');
        const baseUri = config.server.baseUri?.replace(/\/$/, '') ||
          'https://example.com';
        const token = await buildExchangeResultToken({
          exchangeId: updatedExchange.id,
          workflowId: updatedExchange.workflowId,
          procedurePath
        });
        const redirect_uri =
          `${baseUri}/${procedurePath}?exchange_token=${token}`;
        res.send({
          redirect_uri,
          exchange: {
            id: updatedExchange.id,
            oidc: updatedExchange.oidc,
            state: updatedExchange.state,
            successViewFields: resolveSuccessViewFields({
              workflow, exchange: updatedExchange
            })
          }
        });
        return;
      }
      res.status(callbackResult.statusCode || 204).send();
      return;
    } catch(error) {
      const errorMessage = error.message || 'Unknown error';
      // Attribute the failure to a single profile only when it can be. With
      // several requests pending, a response that failed before or during
      // resolution belongs to the whole offered set, and claiming one profile
      // would be a guess. `exchange.variables.profile` is deliberately not read
      // here: pending requests are namespaced, so it is absent until a response
      // resolves.
      const pending = readPendingRequests({exchange});
      const pendingProfiles = pending.map(p => p.profile).filter(Boolean);

      // A response that could not be attributed to any pending request is its
      // own failure mode: it knows the protocol answered and what was pending,
      // but by definition not which profile answered.
      if(error.errorCode === 'DC_API_RESPONSE_UNMATCHED' ||
        error.errorCode === 'DC_API_RESPONSE_AMBIGUOUS') {
        logUtils.presentationDcApiUnresolved({
          clientId: workflow?.clientId,
          exchangeId: exchange.id,
          protocol: responseProtocol(req.body) ?? undefined,
          candidateProfiles: pendingProfiles,
          requestGroupId: pending[0]?.requestGroupId ?? undefined,
          error: errorMessage,
          userAgent
        });
      }

      logUtils.presentationError(
        workflow?.clientId, exchange.id, errorMessage, userAgent,
        pendingProfiles.length === 1 ? pendingProfiles[0] : undefined,
        pending[0]?.requestGroupId ?? undefined,
        pendingProfiles.length > 1 ? pendingProfiles : undefined);

      // Handle verification errors with errors array. The pending requests
      // are deliberately preserved: a response that failed leaves the
      // already-issued requests usable, so retrying with another wallet does
      // not need a fresh authorization request call.
      if(error.errors && Array.isArray(error.errors)) {
        const failedExchange = {
          ...exchange,
          updatedAt: new Date(),
          state: 'invalid',
          variables: {
            ...exchange.variables,
            results: {[exchange.step]: {errors: error.errors}}
          }
        };
        await database.collections.Exchanges.replaceOne({
          id: exchange.id
        }, failedExchange);
        res.status(400).send({errors: error.errors});
        return;
      }

      const statusCode = error.statusCode || 500;
      const errorCode = error.errorCode || 'INTERNAL_ERROR';
      res.status(statusCode).send({
        message: errorMessage,
        error: errorCode
      });
      return;
    }
  }

}
