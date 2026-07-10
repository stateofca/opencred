/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  allowAnyCA,
  extractCertsFromX5C
} from '../../../common/x509.js';
import {
  auditUtils,
  getVpTokenMetadata,
  updateIssuerDidDocumentHistory
} from '../../../common/audit.js';
import {
  decodeJwt,
  exportJWK,
  generateKeyPair,
  calculateJwkThumbprint as joseJwkThumbprint
} from 'jose';
import {
  normalizeVpTokenJwt,
  unenvelopeJwtVp,
  verifyUtils
} from '../../../common/utils.js';
import {
  classifyOID4VPSubmission
} from '../../../common/classifyOid4vpSubmission.js';
import {config} from '@bedrock/core';
import crypto from 'node:crypto';
import {defaultDocLoader} from '../../../common/documentLoader.js';
import {domainToDidWeb} from '../../didWeb.js';
import {getDcqlQuery} from './oid4vp.js';
import {JSONPath} from 'jsonpath-plus';
import {logger} from '../../logger.js';
import {normalizeVpTokenDataIntegrity}
  from '../../../common/utils/vpToken.js';
import {rejectedIssuer} from '../../logger/events/rejectedIssuer.js';
import {verifyLdpPresentation} from '../../../common/vcalm.js';

export {classifyOID4VPSubmission};

/**
 * Verify a submission with JWT format.
 *
 * @param {object} options - Options for JWT submission verification.
 * @param {string} options.vp_token - The VP token.
 * @param {object} options.exchange - The exchange object.
 * @param {object} options.workflow - The workflow config.
 * @param {Function} options.vcQuery - Function that takes the VP and returns
 * the right VC from within it, based on the query.
 * @param {Function} options.documentLoader - Document loader.
 * @param {object} options.presentation_submission - The presentation
 *   submission.
 * @param {string} options.baseUri - Server base URI; used to derive the VP
 *   JWT audience only when `authorizationRequest.client_id` is absent.
 * @returns {object} - {errors, verified, verifiablePresentation}.
 */
export async function verifyJwtSubmission({
  vp_token,
  exchange,
  workflow,
  vcQuery,
  documentLoader,
  presentation_submission,
  baseUri
}) {
  const errors = [];
  let verified = true;
  const vp = unenvelopeJwtVp(vp_token);
  const audience = exchange.variables?.authorizationRequest?.client_id ??
    domainToDidWeb(baseUri);
  const vpResult = await verifyUtils.verifyPresentationJWT(vp_token, {
    audience,
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
        // or if workflow allows any CA
        if(config.opencred.caStore.length > 0 && !allowAnyCA(workflow)) {
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

        // Check issuer against trusted issuers allowlist
        if(workflow.trustedCredentialIssuers?.length > 0) {
          let vcIssuer;
          if(vcJwt) {
            const vcPayload = decodeJwt(vcJwt);
            vcIssuer = vcPayload.iss;
          }
          if(!vcIssuer) {
            vcIssuer = typeof vc.issuer === 'string' ?
              vc.issuer : vc.issuer?.id;
          }
          if(vcIssuer &&
            !workflow.trustedCredentialIssuers.includes(vcIssuer)) {
            const logLevel = config.opencred.options.debug ? 'debug' : 'info';
            const issuerEvent = rejectedIssuer({
              clientId: workflow.clientId,
              exchangeId: exchange?.id,
              rejectedIssuer: vcIssuer,
              logLevel
            });
            logger[logLevel](issuerEvent.logName, issuerEvent.event);
            errors.push('Unaccepted credential issuer');
            verified = false;
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
      if(!await verifyUtils.checkVcQueryMatch({
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
 * Verify a submission with linked data proof (LDP).
 *
 * @param {object} options - Options for LDP submission verification.
 * @param {string} options.vp_token - The VP token string.
 * @param {object} options.exchange - The exchange object.
 * @param {Function} options.vcQuery - Function that takes the VP and returns
 * the right VC from within it, based on the query. By default, it will return
 * the first VC in the array.
 * @param {Function} options.documentLoader - Document loader function.
 * @param {object} options.workflow - The workflow config for this
 *   submission.
 * @param {object} options.presentation_submission - The presentation
 *   submission.
 * @returns {object} - Object with errors, verified, and
 *   verifiablePresentation properties.
 */
export async function verifyLdpSubmission({
  vp_token,
  exchange,
  vcQuery,
  documentLoader,
  workflow,
  presentation_submission
}) {
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
    if(!await verifyUtils.checkVcQueryMatch({
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
    if(workflow.trustedCredentialIssuers?.length > 0 &&
      !workflow.trustedCredentialIssuers.includes(vcIssuer)) {
      const logLevel = config.opencred.options.debug ? 'debug' : 'info';
      const issuerEvent = rejectedIssuer({
        clientId: workflow.clientId,
        exchangeId: exchange?.id,
        rejectedIssuer: vcIssuer,
        logLevel
      });
      logger[logLevel](issuerEvent.logName, issuerEvent.event);
      errors.push('Unaccepted credential issuer');
    }
  } else {
    errors.push('Unable to normalize vp token to Data Integrity.');
  }
  return {errors, verified, verifiablePresentation: vp};
}

/**
 * Verify an OID4VP 1.0 format submission
 * Handles vp_token as object keyed by dcql query ids.
 *
 * @param {object} options - Options for OID4VP 1.0 submission verification.
 * @param {object} options.workflow - The workflow config.
 * @param {object} options.vp_token - Object keyed by dcql query ids:
 * {"<dcql_query.credentials.id>": [<vp>]}.
 * @param {object} options.exchange - The exchange object.
 * @param {Function} options.documentLoader - Document loader function.
 * @param {string} options.baseUri - Base URI for audience verification.
 * @returns {object} - {errors, verified, verifiablePresentation}.
 */
export async function verifyOID4VPSubmission({
  workflow,
  vp_token,
  exchange,
  documentLoader,
  baseUri
}) {
  const errors = [];
  let verified = false;
  let vp;
  const loader = documentLoader ?? defaultDocLoader;
  const vpToken = normalizeOID4VP10VpToken(vp_token);

  const {
    dcql_query
  } = exchange.variables?.authorizationRequest ?? {};

  // vp_token will be an object with keys that are the ids of the
  // credential requests in the queries.
  for(const cq of dcql_query?.credentials ?? []) {
    const submittedVpToken = vpToken[cq.id];
    const presentation = Array.isArray(submittedVpToken) ?
      submittedVpToken[0] : submittedVpToken;
    if(presentation) {
      if(cq.format === 'jwt_vc_json') {
        // JWT VP
        const {
          errors: jwtErrors, verified: jwtV, verifiablePresentation
        } = await verifyJwtSubmission({
          vp_token: presentation,
          exchange,
          workflow,
          documentLoader: loader,
          baseUri
        });
        if(jwtV) {
          verified = true;
          vp = verifiablePresentation;
        }
        errors.push(...jwtErrors);
      } else if(cq.format === 'ldp_vc') {
        // LDP VP
        const {
          errors: lErrors, verified: lV, verifiablePresentation
        } = await verifyLdpSubmission({
          documentLoader: loader,
          vp_token: presentation,
          exchange,
          workflow
        });
        if(lV) {
          verified = true;
          vp = verifiablePresentation;
        }
        errors.push(...lErrors);
      }
    }
  }
  if(config.opencred.audit.enable) {
    await updateIssuerDidDocumentHistory(vpToken);
  }
  return {errors, verified, verifiablePresentation: vp};
}

/**
 * Verify a Draft 18 format submission
 * Handles presentation_submission with descriptor_map.
 *
 * @param {object} options - Options for Draft 18 submission verification.
 * @param {object} options.workflow - The workflow config.
 * @param {object} options.vp_token - The VP token.
 * @param {object} options.submission - The presentation_submission object.
 * @param {object} options.exchange - The exchange object.
 * @param {Function} options.documentLoader - Document loader function.
 * @param {string} options.baseUri - Base URI for audience verification.
 * @returns {object} - {errors, verified, verifiablePresentation}.
 */
export async function verifyDraft18Submission({
  workflow,
  vp_token,
  submission,
  exchange,
  documentLoader,
  baseUri
}) {
  const errors = [];
  let verified = false;
  let vp;
  const loader = documentLoader ?? defaultDocLoader;

  const {
    presentation_definition
  } = exchange.variables?.authorizationRequest ?? {};

  // Legacy support for OID4VP drafts pre-25
  const {valid, error} = getVpTokenMetadata(vp_token);
  if(!valid) {
    errors.push(error);
  }

  if(presentation_definition?.id && submission &&
      submission.definition_id !== presentation_definition.id) {
    errors.push(`Presentation Definition doesn't match Submission`);
  } else if(submission && presentation_definition?.input_descriptors &&
      submission.descriptor_map.length !==
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

  if(!presentation_definition?.input_descriptors) {
    errors.push('Presentation definition with input descriptors is required');
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
      const vpResult = await verifyJwtSubmission({
        vp_token: normalizedVpToken,
        exchange,
        workflow,
        vcQuery: vp => JSONPath({
          path: submitted.path_nested.path,
          json: vp
        })[0],
        presentation_submission: submission,
        baseUri
      });
      verified = vpResult.verified;
      errors.push(...vpResult.errors);
      vp = vpResult.verifiablePresentation;
    } else if(submitted.format === 'ldp_vp') {
      const vpResult = await verifyLdpSubmission({
        vp_token,
        exchange,
        workflow,
        vcQuery: vp => JSONPath({
          path: submitted.path_nested.path,
          json: vp
        })[0],
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
 * based on OID4VP format (Draft 18 or 1.0).
 *
 * @param {object} options - Options for submission verification.
 * @param {object} options.workflow - The workflow config.
 * @param {object} options.vp_token - The VP token.
 * @param {object} options.submission - The presentation_submission (optional).
 * @param {object} options.exchange - The exchange object.
 * @param {Function} options.documentLoader - Document loader function.
 * @param {string} options.baseUri - Base URI for audience verification.
 * @returns {object} - {errors, verified, verifiablePresentation}.
 */
export async function verifySubmission({
  workflow,
  vp_token,
  submission,
  exchange,
  documentLoader,
  baseUri
}) {
  const {
    dcql_query
  } = exchange.variables?.authorizationRequest || {};

  // Classify which OID4VP format is being used
  const format = classifyOID4VPSubmission({
    submission,
    dcql_query
  });

  if(format === 'oid4vp-1.0') {
    return verifyOID4VPSubmission({
      workflow,
      exchange,
      vp_token,
      documentLoader,
      baseUri
    });
  }

  if(format === 'oid4vp-draft18') {
    return verifyDraft18Submission({
      workflow,
      exchange,
      vp_token,
      submission,
      documentLoader,
      baseUri
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

/**
 * Calculate the RFC 7638 JWK SHA-256 thumbprint as raw digest bytes.
 *
 * Delegates to `jose` for canonicalization (required members only, in
 * lexicographic order), then decodes the base64url digest to raw bytes,
 * because callers embed the raw thumbprint bytes in the OID4VP DC API
 * handover tuple.
 *
 * @param {object} publicKeyJwk - Public key JWK object.
 * @returns {Promise<Uint8Array>} SHA-256 thumbprint as raw bytes.
 */
export async function _calculateJwkThumbprint(publicKeyJwk) {
  const base64urlDigest = await joseJwkThumbprint(publicKeyJwk, 'sha256');
  return new Uint8Array(Buffer.from(base64urlDigest, 'base64url'));
}

/**
 * Build DCQL query from workflow query items for mdoc format.
 *
 * @param {object} options - Options.
 * @param {object} options.workflow - Workflow configuration.
 * @param {object} options.exchange - Exchange object.
 * @param {string} options.profile - OID4VP profile identifier.
 * @returns {Promise<object>} DCQL query object.
 */
// eslint-disable-next-line no-unused-vars
export async function _buildDcqlQueryForMdoc({workflow, exchange, profile}) {
  // Find query items with mso_mdoc format
  const mdocQueryItems = workflow?.query?.filter(item => {
    const formats = item.format || [];
    return Array.isArray(formats) && formats.includes('mso_mdoc');
  });

  if(!mdocQueryItems || mdocQueryItems.length === 0) {
    throw new Error(
      'No query items with mso_mdoc format found for native 18013-7 handler'
    );
  }

  // Pre-merge each item's `fieldsToRetain` into `fields` so that
  // getDcqlQuery emits a claim for every field we care about
  // (intent_to_retain flags are stamped afterwards).
  const mergedQueryItems = mdocQueryItems.map(item => {
    const fields = {...(item.fields ?? {})};
    for(const [ns, retainList] of Object.entries(item.fieldsToRetain ?? {})) {
      const union = new Set([...(fields[ns] ?? []), ...retainList]);
      fields[ns] = [...union];
    }
    return {...item, fields};
  });

  // Use existing getDcqlQuery helper but filter for mdoc format
  // Default to OID4VP-1.0 if profile not provided,
  // but use HAIP profile if specified
  const profileToUse = profile || 'OID4VP-1.0';
  const {dcql_query} = await getDcqlQuery({
    workflow: {
      ...workflow,
      query: mergedQueryItems
    },
    profile: profileToUse
  });

  const stampedQuery = _applyIntentToRetainToMdocClaims({
    dcqlQuery: dcql_query,
    mdocQueryItems
  });

  // Add credential_sets with purpose to broaden compatibiilty with
  // possible implementations of wallet consent UX.
  if(stampedQuery?.credentials?.length > 0) {
    const credentialIds = stampedQuery.credentials.map(c => c.id);
    stampedQuery.credential_sets = [{
      options: [credentialIds],
      ...(workflow.description ? {purpose: workflow.description} : {})
    }];
  }

  return stampedQuery;
}

/**
 * Stamp `intent_to_retain` on each mso_mdoc claim based on whether the field
 * appears in any workflow item's `fieldsToRetain`.
 *
 * Assumes `fieldsToRetain` has already been unioned into `fields`
 * upstream, so every retained field is already present as a claim.
 *
 * @param {object} options - Options object.
 * @param {object} options.dcqlQuery - DCQL query produced by
 *   getDcqlQuery.
 * @param {Array<object>} options.mdocQueryItems - Workflow query
 *   items with `format: ['mso_mdoc']`.
 * @returns {object} A new DCQL query with `intent_to_retain` set on
 *   requested mso_mdoc claim.
 */
function _applyIntentToRetainToMdocClaims({dcqlQuery, mdocQueryItems}) {
  const retain = new Map();
  for(const item of mdocQueryItems) {
    for(const [ns, fields] of Object.entries(item.fieldsToRetain ?? {})) {
      if(!retain.has(ns)) {
        retain.set(ns, new Set());
      }
      const set = retain.get(ns);
      for(const f of fields) {
        set.add(f);
      }
    }
  }

  const credentials = (dcqlQuery.credentials ?? []).map(cred => {
    if(cred.format !== 'mso_mdoc') {
      return cred;
    }
    const claims = (cred.claims ?? []).map(claim => {
      const [ns, field] = claim.path ?? [];
      return {
        ...claim,
        intent_to_retain: retain.get(ns)?.has(field) === true
      };
    });
    return {...cred, claims};
  });

  return {...dcqlQuery, credentials};
}

/**
 * Normalize OID4VP 1.0 `vp_token` when delivered as a JSON string (e.g.
 * `direct_post` form-urlencoded per Section 8.1).
 * Passes through bare JWT strings (Draft 18) and non-string values unchanged.
 *
 * @param {unknown} vpToken - Raw vp_token (string map, object map, or bare
 *   JWT).
 * @returns {unknown} Parsed object map if string held JSON object; otherwise
 *   input.
 */
export function normalizeOID4VP10VpToken(vpToken) {
  if(typeof vpToken !== 'string') {
    return vpToken;
  }
  try {
    const parsed = JSON.parse(vpToken);
    if(parsed !== null && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // Not valid JSON (e.g. bare JWT string) — leave as-is
  }
  return vpToken;
}

/**
 * Generate ephemeral key agreement key pair for response encryption.
 *
 * @returns {Promise<object>} Object with public and private JWKs.
 */
export async function _generateEphemeralKeyAgreementPair() {
  const keyPair = await generateKeyPair('ECDH-ES', {
    crv: 'P-256',
    extractable: true
  });

  const [privateKeyJwk, publicKeyJwk] = await Promise.all([
    exportJWK(keyPair.privateKey),
    exportJWK(keyPair.publicKey)
  ]);

  // Set required properties for key agreement
  publicKeyJwk.use = 'enc';
  publicKeyJwk.alg = 'ECDH-ES';
  const kid = `urn:uuid:${crypto.randomUUID()}`;
  privateKeyJwk.kid = publicKeyJwk.kid = kid;

  return {
    privateKeyJwk,
    publicKeyJwk
  };
}

/**
 * Convert PEM certificate to base64 DER format for x5c header.
 *
 * @param {string} pem - PEM certificate string.
 * @returns {string} Base64-encoded DER certificate.
 */
export function _pemToBase64Der(pem) {
  // Extract base64 content from PEM (remove headers and whitespace)
  return pem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');
}

/**
 * Get x5c certificate chain from signing key certificate
 * Builds certificate chain from signing key certificate, excluding trust anchor
 * per HAIP spec.
 * Per HAIP spec: "The X.509 certificate of the trust anchor MUST NOT be
 * included in the x5c JOSE header.".
 *
 * @param {object} signingKey - Signing key configuration.
 * @param {object} options - Optional parameters.
 * @param {object} options.logger - Logger instance
 *   (defaults to imported logger).
 * @returns {Array<string>} Array of base64-encoded DER certificates
 * (excluding trust anchor).
 */
export function _getX5cFromSigningKey(
  signingKey, {logger: loggerParam} = {}
) {
  const log = loggerParam || logger;

  // Use signing key certificate chain if configured
  if(signingKey.certificatePem) {
    // Parse PEM certificate chain
    const certMatches = signingKey.certificatePem.match(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g
    );
    if(certMatches && certMatches.length > 0) {
      // Convert all certificates to base64 DER
      const certs = certMatches.map(_pemToBase64Der);
      // Exclude last certificate (trust anchor) per HAIP spec
      // Keep at least one certificate if only one is present
      return certs.length > 1 ? certs.slice(0, -1) : certs;
    }
  }

  // HAIP and some wallets require x5c header, but if we don't have certificates
  // configured, we'll return empty array (the JWT will be signed without x5c)
  // In production, signing keys should have certificate chains configured
  log.warning(
    'No certificates found for x5c header. HAIP requires x5c header. ' +
    'Consider configuring certificatePem in signing key.'
  );

  return [];
}
