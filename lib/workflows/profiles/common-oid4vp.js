/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
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
import {exportJWK, generateKeyPair} from 'jose';
import {
  normalizeVpTokenDataIntegrity,
  normalizeVpTokenJwt,
  unenvelopeJwtVp,
  verifyUtils
} from '../../../common/utils.js';
import crypto from 'node:crypto';
import {DataItem} from '@auth0/mdl';
import {defaultDocLoader} from '../../../common/documentLoader.js';
import {domainToDidWeb} from '../../didWeb.js';
import {getDcqlQuery} from '../../../common/oid4vp.js';
import jp from 'jsonpath';
import {logger} from '../../logger.js';
import {verifyLdpPresentation} from '../../../common/vcalm.js';

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
export function classifyOID4VPSubmission({submission, dcql_query}) {
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
 * Verify a submission with JWT format
 * @param {object} options
 * @param {string} options.vp_token - The VP token
 * @param {object} options.exchange - The exchange object
 * @param {object} options.workflow - The workflow config
 * @param {function} options.vcQuery - Function that takes the VP and returns
 * the right VC from within it, based on the query
 * @param {function} options.documentLoader - Document loader function
 * @param {object} options.presentation_submission - The presentation submission
 * @param {string} options.baseUri - Base URI for audience verification
 * @param {number} options.caStoreLength - Length of CA store (0 means no CAs)
 * @returns {object} - {errors, verified, verifiablePresentation}
 */
export async function verifyJwtSubmission({
  vp_token,
  exchange,
  workflow,
  vcQuery,
  documentLoader,
  presentation_submission,
  baseUri,
  caStoreLength
}) {
  const errors = [];
  let verified = true;
  const vp = unenvelopeJwtVp(vp_token);
  const vpResult = await verifyUtils.verifyPresentationJWT(vp_token, {
    audience: domainToDidWeb(baseUri),
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
        if(caStoreLength > 0 && !allowAnyCA(workflow)) {
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
 * Verify a submission with linked data proof (LDP)
 * @param {object} options
 * @param {string} options.vp_token
 * @param {object} options.exchange
 * @param {function} options.vcQuery - Function that takes the VP and returns
 * the right VC from within it, based on the query. By default, it will return
 * the first VC in the array.
 * @param {function} options.documentLoader
 * @param {object} options.workflow - the workflow config for this submission
 * @param {object} options.presentation_submission - The presentation submission
 * @returns {object}
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
    if(workflow.trustedCredentialIssuers?.length > 0 &&
      !workflow.trustedCredentialIssuers.includes(vcIssuer)) {
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
 * @param {object} options.workflow - The workflow config
 * @param {object} options.vp_token - Object keyed by dcql query ids:
 * {"<dcql_query.credentials.id>": [<vp>]}
 * @param {object} options.exchange - The exchange object
 * @param {function} options.documentLoader - Document loader function
 * @param {string} options.baseUri - Base URI for audience verification
 * @param {number} options.caStoreLength - Length of CA store (0 means no CAs)
 * @param {boolean} options.auditEnabled - Whether audit is enabled
 * @returns {object} - {errors, verified, verifiablePresentation}
 */
export async function verifyOID4VPSubmission({
  workflow,
  vp_token,
  exchange,
  documentLoader,
  baseUri,
  caStoreLength,
  auditEnabled
}) {
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
        } = await verifyJwtSubmission({
          vp_token: vp_token[cq.id],
          exchange,
          workflow,
          documentLoader: loader,
          baseUri,
          caStoreLength
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
          vp_token: vp_token[cq.id],
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
  if(auditEnabled) {
    await updateIssuerDidDocumentHistory(vp_token);
  }
  return {errors, verified, verifiablePresentation: vp};
}

/**
 * Verify a Draft 18 format submission
 * Handles presentation_submission with descriptor_map
 * @param {object} options
 * @param {object} options.workflow - The workflow config
 * @param {object} options.vp_token - The VP token
 * @param {object} options.submission - The presentation_submission object
 * @param {object} options.exchange - The exchange object
 * @param {function} options.documentLoader - Document loader function
 * @param {string} options.baseUri - Base URI for audience verification
 * @param {number} options.caStoreLength - Length of CA store (0 means no CAs)
 * @param {boolean} options.auditEnabled - Whether audit is enabled
 * @returns {object} - {errors, verified, verifiablePresentation}
 */
export async function verifyDraft18Submission({
  workflow,
  vp_token,
  submission,
  exchange,
  documentLoader,
  baseUri,
  caStoreLength,
  auditEnabled
}) {
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

  if(workflow.trustedCredentialIssuers?.length > 0) {
    if(!issuerDids
      .every(did => workflow.trustedCredentialIssuers.includes(did))) {
      errors.push('Unaccepted credential issuer');
    }
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
        vcQuery: vp => jp.query(vp, submitted.path_nested.path)[0],
        presentation_submission: submission,
        baseUri,
        caStoreLength
      });
      verified = vpResult.verified;
      errors.push(...vpResult.errors);
      vp = vpResult.verifiablePresentation;
    } else if(submitted.format === 'ldp_vp') {
      const vpResult = await verifyLdpSubmission({
        vp_token,
        exchange,
        workflow,
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
  if(auditEnabled) {
    await auditUtils.updateIssuerDidDocumentHistory(vp_token);
  }
  return {errors, verified, verifiablePresentation: vp};
}

/**
 * Verify a submission - dispatches to appropriate verification function
 * based on OID4VP format (Draft 18 or 1.0)
 * @param {object} options
 * @param {object} options.workflow - The workflow config
 * @param {object} options.vp_token - The VP token
 * @param {object} options.submission - The presentation_submission (optional)
 * @param {object} options.exchange - The exchange object
 * @param {function} options.documentLoader - Document loader function
 * @param {string} options.baseUri - Base URI for audience verification
 * @param {number} options.caStoreLength - Length of CA store (0 means no CAs)
 * @param {boolean} options.auditEnabled - Whether audit is enabled
 * @returns {object} - {errors, verified, verifiablePresentation}
 */
export async function verifySubmission({
  workflow,
  vp_token,
  submission,
  exchange,
  documentLoader,
  baseUri,
  caStoreLength,
  auditEnabled
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
      vp_token,
      exchange,
      documentLoader,
      baseUri,
      caStoreLength,
      auditEnabled
    });
  }

  if(format === 'oid4vp-draft18') {
    return verifyDraft18Submission({
      workflow,
      vp_token,
      submission,
      exchange,
      documentLoader,
      baseUri,
      caStoreLength,
      auditEnabled
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
 * Calculate JWK SHA-256 thumbprint per RFC 7638
 * @param {object} publicKeyJwk - Public key JWK object
 * @returns {Promise<Uint8Array>} SHA-256 thumbprint as bytes
 */
export async function _calculateJwkThumbprint(publicKeyJwk) {
  // RFC 7638: Create canonical JSON representation
  // Only include public key parameters, sorted alphabetically
  const canonicalJwk = {};
  const publicParams = [
    'kty', 'crv', 'x', 'y', 'e', 'n', 'use', 'alg', 'kid'
  ];

  for(const param of publicParams) {
    if(publicKeyJwk[param] !== undefined) {
      canonicalJwk[param] = publicKeyJwk[param];
    }
  }

  // Create canonical JSON (sorted keys, no whitespace)
  const canonicalJson = JSON.stringify(canonicalJwk);

  // SHA-256 hash the UTF-8 bytes
  const hash = crypto.createHash('sha256');
  hash.update(canonicalJson, 'utf8');
  return new Uint8Array(hash.digest());
}

/**
 * Encode session transcript for mdoc verification
 * Supports both DC API and redirect (direct_post) response modes
 * @param {object} options - Options object
 * @param {string} options.responseMode - Response mode
 *   ('dc_api', 'dc_api.jwt', or 'direct_post')
 * @param {string} options.origin - Origin for DC API mode
 *   (from expected_origins)
 * @param {string} options.clientId - Client ID for redirect mode
 * @param {string} options.nonce - Nonce from authorization request
 * @param {string|null} options.responseUri - Response URI for redirect mode
 * @param {Uint8Array|null} options.jwkThumbprint - JWK thumbprint
 *   for encrypted modes
 * @returns {Uint8Array} Encoded session transcript
 */
export function _encodeSessionTranscript({
  responseMode,
  origin,
  clientId,
  nonce,
  responseUri,
  jwkThumbprint
}) {
  let handover;

  if(responseMode === 'dc_api' || responseMode === 'dc_api.jwt') {
    // DC API mode: OpenID4VPDCAPIHandover
    // HandoverInfo = [origin, nonce, jwkThumbprint]
    const handoverInfo = [origin, nonce, jwkThumbprint];

    // Encode handover info as CBOR
    const handoverInfoBytes = DataItem.fromData(handoverInfo).buffer;

    // SHA-256 hash the CBOR-encoded handover info
    const hash = crypto.createHash('sha256');
    hash.update(handoverInfoBytes);
    const handoverInfoHash = new Uint8Array(hash.digest());

    // Create handover structure: ["OpenID4VPDCAPIHandover", hash]
    handover = ['OpenID4VPDCAPIHandover', handoverInfoHash];
  } else if(responseMode === 'direct_post') {
    // Redirect mode: OpenID4VPHandover
    // HandoverInfo = [clientId, nonce, jwkThumbprint, responseUri]
    const handoverInfo = [clientId, nonce, jwkThumbprint, responseUri];

    // Encode handover info as CBOR
    const handoverInfoBytes = DataItem.fromData(handoverInfo).buffer;

    // SHA-256 hash the CBOR-encoded handover info
    const hash = crypto.createHash('sha256');
    hash.update(handoverInfoBytes);
    const handoverInfoHash = new Uint8Array(hash.digest());

    // Create handover structure: ["OpenID4VPHandover", hash]
    handover = ['OpenID4VPHandover', handoverInfoHash];
  } else {
    throw new Error(
      `Unsupported response_mode for session transcript: ${responseMode}`
    );
  }

  // Session transcript structure:
  // [DeviceEngagementBytes, EReaderKeyBytes, Handover]
  const encoded = DataItem.fromData([
    // deviceEngagementBytes
    null,
    // eReaderKeyBytes
    null,
    handover
  ]);
  return DataItem.fromData(encoded).buffer;
}

/**
 * Build DCQL query from workflow query items for mdoc format
 * @param {object} options - Options
 * @param {object} options.workflow - Workflow configuration
 * @param {object} options.exchange - Exchange object
 * @param {string} options.profile - OID4VP profile identifier
 * @returns {Promise<object>} DCQL query object
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

  // Use existing getDcqlQuery helper but filter for mdoc format
  // Default to OID4VP-1.0 if profile not provided,
  // but use HAIP profile if specified
  const profileToUse = profile || 'OID4VP-1.0';
  const {dcql_query} = await getDcqlQuery({
    workflow: {
      ...workflow,
      query: mdocQueryItems
    },
    profile: profileToUse
  });

  // Ensure all credentials have mso_mdoc format
  if(dcql_query?.credentials) {
    for(const cred of dcql_query.credentials) {
      if(cred.format !== 'mso_mdoc') {
        cred.format = 'mso_mdoc';
      }
    }
  }

  return dcql_query;
}

/**
 * Generate ephemeral key agreement key pair for response encryption
 * @returns {Promise<object>} Object with public and private JWKs
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
 * Convert PEM certificate to base64 DER format for x5c header
 * @param {string} pem - PEM certificate string
 * @returns {string} Base64-encoded DER certificate
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
 * included in the x5c JOSE header."
 * @param {object} signingKey - Signing key configuration
 * @param {object} options - Optional parameters
 * @param {object} options.logger - Logger instance
 *   (defaults to imported logger)
 * @returns {Array<string>} Array of base64-encoded DER certificates
 * (excluding trust anchor)
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

