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
import {domainToDidWeb} from '../didWeb.js';
import {getDcqlQuery} from '../../common/oid4vp.js';
import {logger} from '../logger.js';
import {sendCallback} from '../callback.js';
import {Verifier} from '@auth0/mdl';
import {X509Certificate} from 'node:crypto';

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
 * @returns {Promise<object>} DCQL query object
 */
export async function _buildDcqlQueryForMdoc({rp, exchange}) {
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
  const {dcql_query} = await getDcqlQuery({
    rp: {
      ...rp,
      query: mdocQueryItems
    },
    exchange,
    profile: 'OID4VP-1.0'
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
 * Get x5c certificate chain from signing key and caStore
 * Builds certificate chain from signing key certificate (if available) and
 * intermediate certificates from caStore, excluding trust anchor per HAIP spec.
 * Per HAIP spec: "The X.509 certificate of the trust anchor MUST NOT be
 * included in the x5c JOSE header."
 * @param {object} signingKey - Signing key configuration
 * @param {object} options - Optional parameters
 * @param {Array<string>} options.caStore - Certificate store array
 *   (defaults to config.opencred?.caStore)
 * @param {object} options.logger - Logger instance
 *   (defaults to imported logger)
 * @returns {Array<string>} Array of base64-encoded DER certificates
 * (excluding trust anchor)
 */
export function _getX5cFromSigningKey(
  signingKey, {caStore, logger: loggerParam} = {}
) {
  const x5c = [];
  const log = loggerParam || logger;
  const certStore = caStore !== undefined ?
    caStore : (config.opencred?.caStore || []);

  // Priority 1: If signing key has a certificate chain configured, use it
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

  // Priority 2: Build chain from caStore certificates
  if(certStore.length > 0) {
    // Use only the first certificate from caStore for now
    const certsToInclude = [certStore[0]];

    for(const pem of certsToInclude) {
      try {
        // Validate it's a proper PEM certificate
        /* eslint-disable-next-line no-unused-vars */
        const cert = new X509Certificate(pem);
        // Convert to base64 DER for x5c header
        x5c.push(_pemToBase64Der(pem));
      } catch(error) {
        log.warning(
          'Invalid certificate in caStore, skipping:', error.message
        );
      }
    }
  }

  // HAIP requires x5c header, but if we don't have certificates configured,
  // we'll return empty array (the JWT will be signed without x5c)
  // In production, signing keys should have certificate chains configured
  if(x5c.length === 0) {
    log.warning(
      'No certificates found for x5c header. HAIP requires x5c header. ' +
      'Consider configuring certificatePem in signing key or ensuring ' +
      'caStore contains certificates (excluding trust anchor).'
    );
  }

  return x5c;
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
 * @param {Function} options.replaceExchange - Function to replace exchange
 *   (defaults to database.collections.Exchanges.replaceOne)
 * @returns {Promise<Object>} Object containing jwt and updatedExchange
 */
export async function handleNative18013AnnexDRequest({
  rp,
  exchange,
  requestUrl,
  baseUri,
  signingKeys,
  replaceExchange
} = {}) {
  const serverBaseUri = baseUri !== undefined ?
    baseUri : config.server.baseUri;
  const keys = signingKeys !== undefined ?
    signingKeys : config.opencred.signingKeys;
  const replaceFn = replaceExchange ||
    database.collections.Exchanges.replaceOne.bind(
      database.collections.Exchanges
    );

  // Build response URL
  const responseUrl = `${serverBaseUri}${
    requestUrl.replace('request', 'response')}`;

  // Build DCQL query from workflow query items
  const dcql_query = await _buildDcqlQueryForMdoc({rp, exchange});

  // Generate ephemeral key agreement key pair for response encryption
  const {privateKeyJwk, publicKeyJwk} =
    await _generateEphemeralKeyAgreementPair();

  // Build client_metadata with HAIP requirements
  const client_metadata = {
    vp_formats: {
      mso_mdoc: {
        alg: ['ES256']
      }
    },
    jwks: {
      keys: [publicKeyJwk]
    },
    encrypted_response_enc_values_supported: ['A128GCM', 'A256GCM']
  };

  // Build authorization request
  const domain = serverBaseUri;
  const authorizationRequest = {
    aud: 'https://self-issued.me/v2',
    client_id: domainToDidWeb(domain),
    client_id_scheme: 'did',
    response_type: 'vp_token',
    response_mode: 'direct_post.jwt',
    response_uri: responseUrl,
    nonce: exchange.challenge || await createId(),
    state: await createId(),
    dcql_query,
    client_metadata
  };

  // Get signing key
  const signingKey = keys.find(k =>
    k.purpose?.includes('authorization_request')
  );
  if(!signingKey) {
    throw new Error('No signing key with purpose authorization_request found');
  }

  // Get x5c certificate chain (excluding trust anchor per HAIP)
  const x5c = _getX5cFromSigningKey(signingKey);

  // Sign authorization request JWT
  const privateKey = await importPKCS8(
    signingKey.privateKeyPem, signingKey.type);
  const protectedHeader = {
    alg: signingKey.type,
    kid: `${domainToDidWeb(domain)}#${signingKey.id}`,
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
      ephemeralKeyAgreementPrivateKey: privateKeyJwk,
      mdocGeneratedNonce: await createId()
    }
  };

  await replaceFn(
    {id: exchange.id},
    updatedExchange
  );

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

