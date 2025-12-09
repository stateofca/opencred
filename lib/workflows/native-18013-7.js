/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as base64url from 'base64url-universal';
import {
  exportJWK, generateKeyPair, importJWK, importPKCS8, jwtDecrypt, SignJWT
} from 'jose';
import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {database} from '../database.js';
import {DataItem} from '@auth0/mdl';
import {getDcqlQuery} from '../../common/oid4vp.js';
import {logger} from '../logger.js';
import {sendCallback} from '../callback.js';
import {Verifier} from '@auth0/mdl';

/**
 * Encode session transcript for mdoc verification
 * @param {object} sessionTranscript - Session transcript object
 * @returns {Uint8Array} Encoded session transcript
 */
export function _encodeSessionTranscript(sessionTranscript) {
  const {
    mdocGeneratedNonce,
    clientId,
    responseUri,
    verifierGeneratedNonce
  } = sessionTranscript;
  const encoded = DataItem.fromData([
    // deviceEngagementBytes
    null,
    // eReaderKeyBytes
    null,
    [mdocGeneratedNonce, clientId, responseUri, verifierGeneratedNonce],
  ]);
  return DataItem.fromData(encoded).buffer;
}

/**
 * Build DCQL query from workflow query items for mdoc format
 * @param {object} options - Options
 * @param {object} options.rp - Relying party configuration
 * @param {object} options.exchange - Exchange object
 * @param {string} options.profile - OID4VP profile identifier
 * @returns {Promise<object>} DCQL query object
 */
export async function _buildDcqlQueryForMdoc({rp, exchange, profile}) {
  // Find query items with mso_mdoc format
  const mdocQueryItems = rp?.query?.filter(item => {
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
    rp: {
      ...rp,
      query: mdocQueryItems
    },
    exchange,
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

/**
 * Handle native 18013-7-Annex-D authorization request
 * @param {Object} options - Options object
 * @param {Object} options.rp - The relying party configuration
 * @param {Object} options.exchange - The exchange object
 * @param {string} options.requestUrl - The original request URL
 * @param {string} options.userAgent - The user agent string
 * @param {string} options.baseUri - Base URI
 *   (defaults to config.server.baseUri)
 * @param {Array} options.signingKeys - Signing keys array
 *   (defaults to config.opencred.signingKeys)
 * @param {string} options.profile - OID4VP profile identifier
 * @returns {Promise<Object>} Object containing jwt and updatedExchange
 */
export async function handleNative18013AnnexDRequest({
  rp,
  exchange,
  requestUrl,
  baseUri,
  signingKeys,
  profile
} = {}) {
  const serverBaseUri = baseUri !== undefined ?
    baseUri : config.server.baseUri;
  const keys = signingKeys !== undefined ?
    signingKeys : config.opencred.signingKeys;

  // Get signing key
  const signingKey = keys.find(k =>
    k.purpose?.includes('authorization_request')
  );
  if(!signingKey) {
    throw new Error('No signing key with purpose authorization_request found');
  }

  // Extract hostname from baseUri for x509_san_dns client_id
  const url = new URL(serverBaseUri);
  const hostname = url.hostname;
  const clientId = `x509_san_dns:${hostname}`;

  // Build DCQL query from workflow query items
  const dcql_query = await _buildDcqlQueryForMdoc({rp, exchange, profile});

  // Determine response mode
  // First check for response_mode query parameter in requestUrl
  const supportedResponseModes = ['direct_post', 'dc_api'];
  let responseMode;

  try {
    // Parse requestUrl to extract query parameters
    // requestUrl might be relative, so construct full URL if needed
    const requestUrlObj = requestUrl.startsWith('http') ?
      new URL(requestUrl) :
      new URL(requestUrl, serverBaseUri);
    const responseModeParam = requestUrlObj.searchParams.get('response_mode');

    if(responseModeParam) {
      // Validate response_mode parameter
      if(!supportedResponseModes.includes(responseModeParam)) {
        throw new Error(
          `Unsupported response_mode: ${responseModeParam}. ` +
          `Supported values: ${supportedResponseModes.join(', ')}`
        );
      }
      responseMode = responseModeParam;
    } else {
      // Use default based on profile
      // HAIP section 5.2 requires dc_api.jwt (encrypted) response mode
      responseMode = profile === 'OID4VP-HAIP-1.0' ? 'dc_api.jwt' : 'dc_api';
    }
  } catch(error) {
    // If URL parsing fails or validation fails, use profile default
    if(error.message.includes('Unsupported response_mode')) {
      throw error;
    }
    // For URL parsing errors, fall back to profile default
    responseMode = profile === 'OID4VP-HAIP-1.0' ? 'dc_api.jwt' : 'dc_api';
  }

  // Build client_metadata
  // For HAIP profile, use vp_formats_supported instead of vp_formats
  // per HAIP section 5.2 and 5.3.1 requirements
  const client_metadata = {};

  if(profile === 'OID4VP-HAIP-1.0') {
    // HAIP requires vp_formats_supported (not vp_formats)
    client_metadata.vp_formats_supported = {
      mso_mdoc: {
        alg: ['ES256']
      }
    };
    // HAIP section 5.2 requires encrypted responses
    client_metadata.encrypted_response_enc_values_supported =
      ['A128GCM', 'A256GCM'];
  } else {
    // For non-HAIP profiles, use vp_formats (legacy format)
    client_metadata.vp_formats = {
      mso_mdoc: {
        alg: ['ES256']
      }
    };
  }

  // Get x5c certificate chain (excluding trust anchor per HAIP)
  const x5c = _getX5cFromSigningKey(signingKey);

  // Generate ephemeral key agreement key pair for jwt mode
  // (encrypted responses). Store it for response decryption regardless
  // of x5c presence
  if(responseMode.includes('jwt')) {
    const {privateKeyJwk, publicKeyJwk} =
      await _generateEphemeralKeyAgreementPair();

    // Only add jwks to client_metadata if x5c is not present
    // When x5c is present, keys are shared via certificate, not jwks
    if(x5c.length === 0) {
      client_metadata.jwks = {
        keys: [publicKeyJwk]
      };
    }

    // Always store ephemeral key for response decryption
    exchange.variables = exchange.variables || {};
    exchange.variables.ephemeralKeyAgreementPrivateKey = privateKeyJwk;
  }

  // Build authorization request
  const authorizationRequest = {
    client_id: clientId,
    client_id_scheme: 'x509_san_dns',
    response_type: 'vp_token',
    response_mode: responseMode,
    expected_origins: [serverBaseUri],
    nonce: exchange.challenge || await createId(),
    state: await createId(),
    dcql_query,
    client_metadata
  };

  // Add response_uri for direct_post response mode
  if(responseMode === 'direct_post') {
    // Parse requestUrl to extract pathname without query parameters
    const requestUrlObj = requestUrl.startsWith('http') ?
      new URL(requestUrl) :
      new URL(requestUrl, serverBaseUri);
    // Replace 'request' with 'response' in the pathname
    const responsePath = requestUrlObj.pathname.replace('request', 'response');
    // Construct response_uri without query parameters
    authorizationRequest.response_uri = `${serverBaseUri}${responsePath}`;
  }

  // Sign authorization request JWT
  const privateKey = await importPKCS8(
    signingKey.privateKeyPem, signingKey.type);
  const protectedHeader = {
    alg: signingKey.type,
    kid: `${hostname}#${signingKey.id}`,
    typ: 'oauth-authz-req+jwt',
    ...(x5c.length > 0 ? {x5c} : {})
  };

  const jwt = await new SignJWT(authorizationRequest)
    .setProtectedHeader(protectedHeader)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(privateKey);

  // Store state in exchange variables
  const updatedExchange = {
    ...exchange,
    state: 'active',
    updatedAt: new Date(),
    variables: {
      ...exchange.variables,
      authorizationRequest,
      mdocGeneratedNonce: await createId()
    }
  };

  return {
    jwt,
    updatedExchange
  };
}

/**
 * Handle native 18013-7-Annex-D authorization response
 * @param {Object} options - Options object
 * @param {Object} options.rp - The relying party configuration
 * @param {Object} options.exchange - The exchange object
 * @param {string} options.responseUrl - The response URL
 * @param {Object} options.responseBody - The response body from the client
 * @returns {Promise<Object>} Object containing results and finalExchange
 */
export async function handleNative18013AnnexDResponse({
  rp,
  exchange,
  responseBody
}) {
  // Retrieve stored ephemeral key agreement private key
  const privateKeyJwk = exchange.variables?.ephemeralKeyAgreementPrivateKey;
  if(!privateKeyJwk) {
    throw new Error(
      'Ephemeral key agreement private key not found in exchange variables'
    );
  }

  // Retrieve authorization request
  const authorizationRequest = exchange.variables?.authorizationRequest;
  if(!authorizationRequest) {
    throw new Error('Authorization request not found in exchange variables');
  }

  // Decrypt JWT response
  let decryptedPayload;
  try {
    const jwt = responseBody.response || responseBody;
    if(typeof jwt !== 'string') {
      throw new Error('Expected JWT string in response body');
    }

    // Import the private key JWK for decryption
    const privateKey = await importJWK(privateKeyJwk, 'ECDH-ES');

    const result = await jwtDecrypt(jwt, privateKey, {
      contentEncryptionAlgorithms: ['A128GCM', 'A256GCM'],
      keyManagementAlgorithms: ['ECDH-ES']
    });
    decryptedPayload = result.payload;
  } catch(error) {
    logger.error('Failed to decrypt authorization response:', error);
    throw new Error(`Failed to decrypt authorization response: ${
      error.message}`);
  }

  // Extract vp_token
  const vpToken = decryptedPayload.vp_token;
  if(!vpToken) {
    throw new Error('vp_token not found in decrypted response');
  }

  // Handle mdoc format
  // vp_token should be base64url-encoded DeviceResponse for mdoc
  let deviceResponse;
  if(typeof vpToken === 'string') {
    // Decode base64url DeviceResponse
    deviceResponse = base64url.decode(vpToken);
  } else {
    throw new Error(
      'Expected vp_token to be base64url-encoded string for mdoc');
  }

  // Reconstruct session transcript
  const mdocGeneratedNonce = exchange.variables?.mdocGeneratedNonce ||
    await createId();
  const sessionTranscript = {
    mdocGeneratedNonce,
    clientId: authorizationRequest.client_id,
    responseUri: authorizationRequest.response_uri,
    verifierGeneratedNonce: authorizationRequest.nonce
  };

  // Encode session transcript
  const encodedSessionTranscript = _encodeSessionTranscript(sessionTranscript);

  // Get trusted certificates from caStore
  const trustedCertificates = config.opencred.caStore || [];
  if(trustedCertificates.length === 0) {
    throw new Error(
      'No trusted certificates configured in caStore for mdoc verification'
    );
  }

  // Verify mdoc using @auth0/mdl
  let verifiedMdoc;
  let verifiablePresentation;
  try {
    const verifier = new Verifier(trustedCertificates);
    verifiedMdoc = await verifier.verify(deviceResponse, {
      encodedSessionTranscript
    });

    // Convert verified mdoc to verifiable presentation format
    const encodedMdoc = new Uint8Array(verifiedMdoc.encode());
    const b64Mdl = Buffer.from(encodedMdoc).toString('base64');
    verifiablePresentation = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: 'VerifiablePresentation',
      verifiableCredential: [{
        id: `data:application/mdl;base64,${b64Mdl}`,
        type: 'EnvelopedVerifiableCredential'
      }]
    };
  } catch(error) {
    logger.error('mdoc verification failed:', error);
    throw new Error(`mdoc verification failed: ${error.message}`);
  }

  // Generate OIDC authorization code
  const oidcCode = await createId();

  // Update exchange with results
  const updatedExchange = {
    ...exchange,
    state: 'complete',
    step: 'default',
    oidc: {
      code: oidcCode,
      state: exchange.oidc?.state
    },
    updatedAt: new Date(),
    variables: {
      ...exchange.variables,
      results: {
        default: {
          verifiablePresentation,
          vpToken: responseBody.response || responseBody
        }
      }
    }
  };

  await database.collections.Exchanges.replaceOne(
    {id: exchange.id},
    updatedExchange
  );

  // Get the updated exchange to return to frontend
  const finalExchange = await database.collections.Exchanges.findOne({
    id: exchange.id
  });

  // Send callback to relying party if configured
  if(rp.callback) {
    const callbackSuccess = await sendCallback(rp, finalExchange);
    if(!callbackSuccess) {
      logger.warning('Failed to send callback to relying party');
    }
  }

  return {
    results: {
      verifiablePresentation
    },
    finalExchange
  };
}

