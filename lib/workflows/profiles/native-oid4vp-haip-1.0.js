/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as base64url from 'base64url-universal';
import {
  _buildDcqlQueryForMdoc, _calculateJwkThumbprint, _encodeSessionTranscript,
  _generateEphemeralKeyAgreementPair, _getX5cFromSigningKey
} from './common-oid4vp.js';
import {importJWK, jwtDecrypt} from 'jose';
import {config} from '@bedrock/core';
import {createId} from '../../../common/utils.js';
import crypto from 'node:crypto';
import {DataItem} from '@auth0/mdl';
import {logger} from '../../logger.js';
import {Verifier} from '@auth0/mdl';

/**
 * Create session transcript for dc_api.jwt response mode with
 * encryption (HAIP).
 *
 * @param {string} origin - Origin (server base URI).
 * @param {string} nonce - Nonce from authorization request.
 * @param {Uint8Array} jwkThumbprint - JWK thumbprint for key agreement.
 * @returns {Uint8Array} Encoded session transcript.
 */
async function _createSessionTranscriptHaipJwt(origin, nonce, jwkThumbprint) {
  // HandoverInfo = [origin, nonce, jwkThumbprint]
  const handoverInfo = [origin, nonce, jwkThumbprint];

  // Encode handover info as CBOR
  const handoverInfoBytes = DataItem.fromData(handoverInfo).buffer;

  // SHA-256 hash the CBOR-encoded handover info
  const hash = crypto.createHash('sha256');
  hash.update(handoverInfoBytes);
  const handoverInfoHash = new Uint8Array(hash.digest());

  // Create handover structure: ["OpenID4VPDCAPIHandover", hash]
  const handover = ['OpenID4VPDCAPIHandover', handoverInfoHash];

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
 * Generate authorization request for OID4VP-HAIP-1.0 profile with dc_api.jwt
 * response mode (encrypted, MUST per HAIP section 5.2).
 *
 * @param {object} options - Options object.
 * @param {object} options.workflow - The workflow configuration.
 * @param {object} options.exchange - The exchange object.
 * @param {string} options.requestUrl - The original request URL.
 * @param {string} [options.userAgent] - The user agent string (optional).
 * @param {string} [options.baseUri] - Base URI (optional, derived from
 *   requestUrl if not provided).
 * @param {Array} [options.signingKeys] - Signing keys array (optional).
 * @param {string} options.profile - OID4VP profile identifier
 *   (should be 'OID4VP-HAIP-1.0').
 * @param {string} options.responseMode - Response mode
 *   (should be 'dc_api.jwt').
 * @returns {Promise<object>} Object containing authorizationRequest,
 *   updatedExchange, and signingMetadata.
 */
export async function generateAuthorizationRequest({
  workflow,
  exchange,
  baseUri,
  signingKeys,
  profile,
  responseMode
}) {
  // Use passed baseUri (which is config.server.baseUri) for server identity
  // This ensures client_id always represents the canonical server identity
  const serverBaseUri = baseUri || config.server.baseUri;
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
  const dcql_query = await _buildDcqlQueryForMdoc({
    workflow, exchange, profile});

  // Build client_metadata
  // HAIP requires vp_formats_supported (not vp_formats) per HAIP section 5.3.1
  const client_metadata = {
    vp_formats_supported: {
      mso_mdoc: {
        alg: ['ES256']
      }
    },
    // HAIP section 5.2 requires encrypted responses
    encrypted_response_enc_values_supported: ['A128GCM', 'A256GCM']
  };

  // Get x5c certificate chain (excluding trust anchor per HAIP)
  const x5c = _getX5cFromSigningKey(signingKey);

  // Generate ephemeral key agreement key pair for encrypted responses
  const keyPair = await _generateEphemeralKeyAgreementPair();
  const privateKeyJwk = keyPair.privateKeyJwk;
  const publicKeyJwk = keyPair.publicKeyJwk;

  // Only add jwks to client_metadata if x5c is not present
  // When x5c is present, keys are shared via certificate, not jwks
  if(x5c.length === 0) {
    client_metadata.jwks = {
      keys: [publicKeyJwk]
    };
  }

  // Calculate JWK thumbprint for session transcript
  const jwkThumbprint = await _calculateJwkThumbprint(publicKeyJwk);

  // Build authorization request
  const authorizationRequest = {
    client_id: clientId,
    client_id_scheme: 'x509_san_dns',
    response_type: 'vp_token',
    response_mode: responseMode || 'dc_api.jwt',
    expected_origins: [serverBaseUri],
    nonce: exchange.challenge || await createId(),
    state: await createId(),
    dcql_query,
    client_metadata
  };

  // Create session transcript for dc_api.jwt response mode
  // This must match exactly what the device will use for signature
  // verification
  const encodedSessionTranscript = await _createSessionTranscriptHaipJwt(
    serverBaseUri,
    authorizationRequest.nonce,
    jwkThumbprint
  );

  // Store state in exchange variables
  const updatedExchange = {
    ...exchange,
    state: 'active',
    updatedAt: new Date(),
    variables: {
      ...exchange.variables,
      authorizationRequest,
      ephemeralKeyAgreementPrivateKey: privateKeyJwk,
      ephemeralKeyAgreementPublicKey: publicKeyJwk,
      encodedSessionTranscript
    }
  };

  // Return signing metadata for JWT signing
  const signingMetadata = {
    x5c,
    kid: `${hostname}#${signingKey.id}`,
    alg: signingKey.type
  };

  return {
    authorizationRequest,
    updatedExchange,
    signingMetadata
  };
}

/**
 * Handle authorization response for OID4VP-HAIP-1.0 profile
 * HAIP uses dc_api.jwt response mode (encrypted, MUST per HAIP section 5.2).
 *
 * @param {object} options - Options object.
 * @param {object} options.workflow - The workflow configuration.
 * @param {object} options.exchange - The exchange object.
 * @param {string} options.responseUrl - The response URL.
 * @param {object} options.responseBody - The response body from the client.
 * @returns {Promise<object>} Object containing updatedExchange.
 */
export async function handleAuthorizationResponse({
  // eslint-disable-next-line no-unused-vars
  workflow,
  exchange,
  // eslint-disable-next-line no-unused-vars
  responseUrl,
  responseBody
}) {
  // Retrieve authorization request
  const authorizationRequest = exchange.variables?.authorizationRequest;
  if(!authorizationRequest) {
    throw new Error('Authorization request not found in exchange variables');
  }

  // Get response_mode from authorization request
  // (should be dc_api.jwt for HAIP)
  const responseMode = authorizationRequest.response_mode;

  // HAIP requires encrypted responses (dc_api.jwt)
  if(responseMode !== 'dc_api.jwt') {
    throw new Error(
      'HAIP profile requires dc_api.jwt response mode'
    );
  }

  // Retrieve stored ephemeral key agreement private key
  const privateKeyJwk =
    exchange.variables?.ephemeralKeyAgreementPrivateKey;
  if(!privateKeyJwk) {
    throw new Error(
      'Ephemeral key agreement private key not found in ' +
      'exchange variables for HAIP encrypted response mode'
    );
  }

  // Handle DC API container structure
  let actualResponseBody = responseBody;
  if(responseBody && responseBody.protocol === 'openid4vp' &&
    responseBody.data) {
    actualResponseBody = responseBody.data;
  }

  // Validate state parameter
  if(actualResponseBody && typeof actualResponseBody.state === 'string') {
    const expectedState = authorizationRequest.state;
    const receivedState = actualResponseBody.state;
    if(expectedState && receivedState !== expectedState) {
      throw new Error(
        `Parameter 'state' failed to match.`
      );
    }
  }

  // Verify dcql_query structure and credential IDs
  const dcqlQuery = authorizationRequest.dcql_query;
  if(!dcqlQuery || !Array.isArray(dcqlQuery.credentials)) {
    throw new Error(
      'Invalid dcql_query: credentials array not found'
    );
  }
  const credentialIds = dcqlQuery.credentials.map(cred => cred.id);
  if(credentialIds.length === 0) {
    throw new Error(
      'Invalid dcql_query. No credential IDs found in credentials'
    );
  }

  // Decrypt JWT response
  let vpTokenString;
  try {
    const jwt = actualResponseBody.response || actualResponseBody;
    if(typeof jwt !== 'string') {
      throw new Error('Expected JWT string in response body for dc_api.jwt');
    }

    const privateKey = await importJWK(privateKeyJwk, 'ECDH-ES');
    const result = await jwtDecrypt(jwt, privateKey, {
      contentEncryptionAlgorithms: ['A128GCM', 'A256GCM'],
      keyManagementAlgorithms: ['ECDH-ES']
    });
    const decryptedPayload = result.payload;

    // Extract vp_token from decrypted payload
    const vpToken = decryptedPayload.vp_token;
    if(!vpToken) {
      throw new Error('vp_token not found in decrypted response');
    }

    // Handle vp_token format
    if(typeof vpToken === 'string') {
      vpTokenString = vpToken;
    } else if(typeof vpToken === 'object' && vpToken !== null) {
      const credentialId = credentialIds[0];
      vpTokenString = vpToken[credentialId];
      if(!vpTokenString) {
        const availableIds = Object.keys(vpToken).join(', ');
        const queryIds = credentialIds.join(', ');
        throw new Error(
          `Credential ID "${credentialId}" not found in vp_token. ` +
          `Available IDs in response: ${availableIds || 'none'}. ` +
          `Expected IDs from query: ${queryIds}`
        );
      }
    } else {
      throw new Error(
        'Expected vp_token to be string or object in decrypted response');
    }
  } catch(error) {
    logger.error('Failed to decrypt HAIP authorization response:', error);
    throw new Error(`Failed to decrypt authorization response: ${
      error.message}`);
  }

  // Ensure we have a vp_token string
  if(!vpTokenString || typeof vpTokenString !== 'string') {
    throw new Error(
      'Expected vp_token to be a base64url-encoded string for mdoc'
    );
  }

  // Decode base64url DeviceResponse
  const deviceResponse = base64url.decode(vpTokenString);

  // Use stored session transcript if available
  let encodedSessionTranscript = exchange.variables?.encodedSessionTranscript;

  if(!encodedSessionTranscript) {
    logger.warning('Session transcript not found in exchange variables.');

    const nonce = authorizationRequest.nonce;
    if(!nonce) {
      throw new Error('nonce not found in authorization request');
    }

    const expectedOrigins = authorizationRequest.expected_origins;
    if(!expectedOrigins || expectedOrigins.length === 0) {
      throw new Error(
        'expected_origins not found in authorization request ' +
        'for HAIP DC API mode'
      );
    }
    const origin = expectedOrigins[0].startsWith('origin:') ?
      expectedOrigins[0].substring(7) : expectedOrigins[0];

    const publicKeyJwk =
      exchange.variables?.ephemeralKeyAgreementPublicKey;
    if(!publicKeyJwk) {
      throw new Error(
        'ephemeralKeyAgreementPublicKey not found in ' +
        'exchange variables. It should have been stored during ' +
        'authorization request.'
      );
    }
    const jwkThumbprint = await _calculateJwkThumbprint(publicKeyJwk);

    // Encode session transcript using HAIP method
    encodedSessionTranscript = _encodeSessionTranscript({
      responseMode: 'dc_api.jwt',
      origin,
      clientId: null,
      nonce,
      responseUri: null,
      jwkThumbprint
    });
  }

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
          vpToken: vpTokenString
        }
      }
    }
  };

  return {
    updatedExchange
  };
}

