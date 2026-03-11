/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as base64url from 'base64url-universal';
import {
  _buildDcqlQueryForMdoc, _calculateJwkThumbprint,
  _encodeSessionTranscript, _getX5cFromSigningKey
} from './common-oid4vp.js';
import {importJWK, jwtDecrypt} from 'jose';
import {buildMdocCredentialSubject} from '../../../common/mdoc.js';
import {config} from '@bedrock/core';
import {createId} from '../../../common/utils.js';
import crypto from 'node:crypto';
import {DataItem} from '@auth0/mdl';
import {logger} from '../../logger.js';
import {Verifier} from '@auth0/mdl';

/**
 * Create session transcript for Annex D DC API mode.
 *
 * @param {string} origin - Origin (server base URI).
 * @param {string} clientId - Client ID.
 * @param {string} nonce - Nonce from authorization request.
 * @returns {Uint8Array} Encoded session transcript.
 */
function _createSessionTranscriptAnnexD(origin, clientId, nonce) {
  const handoverInfo = [origin, clientId, nonce];
  const handoverInfoBytes = DataItem.fromData(handoverInfo).buffer;
  const hash = crypto.createHash('sha256');
  hash.update(handoverInfoBytes);
  const handoverInfoHash = new Uint8Array(hash.digest());
  const handover = ['OpenID4VPDCAPIHandover', handoverInfoHash];

  // SessionTranscript = [DeviceEngagementBytes, EReaderKeyBytes, Handover]
  // For DC API, DeviceEngagementBytes and EReaderKeyBytes are null
  const sessionTranscript = [null, null, handover];

  // Double-encode as per spec:
  // SessionTranscriptBytes = #6.24(bstr .cbor SessionTranscript)
  const encoded = DataItem.fromData(sessionTranscript);
  return DataItem.fromData(encoded).buffer;
}

/**
 * Generate authorization request for 18013-7-Annex-D profile with dc_api
 * response mode (unencrypted).
 *
 * @param {object} options - Options object.
 * @param {object} options.workflow - The workflow configuration.
 * @param {object} options.exchange - The exchange object.
 * @param {string} [options.baseUri] - Base URI (optional, derived from
 *   requestUrl if not provided).
 * @param {Array} [options.signingKeys] - Signing keys array (optional).
 * @param {string} options.profile - OID4VP profile identifier.
 * @param {string} options.responseMode - Response mode (should be 'dc_api').
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
  // Annex-D uses vp_formats (legacy format)
  const client_metadata = {
    vp_formats: {
      mso_mdoc: {
        alg: ['ES256']
      }
    }
  };

  // Get x5c certificate chain (excluding trust anchor per HAIP)
  const x5c = _getX5cFromSigningKey(signingKey);

  // Build authorization request
  const authorizationRequest = {
    client_id: clientId,
    client_id_scheme: 'x509_san_dns',
    response_type: 'vp_token',
    response_mode: responseMode || 'dc_api',
    expected_origins: [serverBaseUri],
    nonce: exchange.challenge || await createId(),
    state: await createId(),
    dcql_query,
    client_metadata
  };

  // Create session transcript for DC API mode (Annex D)
  // This must match exactly what the device will use for signature verification
  const encodedSessionTranscript = _createSessionTranscriptAnnexD(
    serverBaseUri,
    clientId,
    authorizationRequest.nonce
  );

  // Store state in exchange variables
  const updatedExchange = {
    ...exchange,
    state: 'active',
    updatedAt: new Date(),
    variables: {
      ...exchange.variables,
      authorizationRequest,
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
 * Handle authorization response for 18013-7-Annex-D profile.
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
  const responseMode = authorizationRequest.response_mode;

  // Retrieve stored ephemeral key agreement private key
  // (only needed for encrypted responses)
  let privateKeyJwk = null;
  if(responseMode === 'dc_api.jwt' ||
    responseMode === 'direct_post.jwt') {
    privateKeyJwk =
      exchange.variables?.ephemeralKeyAgreementPrivateKey;
    if(!privateKeyJwk) {
      throw new Error(
        'Ephemeral key agreement private key not found in ' +
        'exchange variables for encrypted response mode'
      );
    }
  }

  // Handle DC API container structure
  // Check if responseBody is wrapped in DC API container
  let actualResponseBody = responseBody;
  if(responseBody && responseBody.protocol === 'openid4vp' &&
    responseBody.data) {
    // Extract data from DC API container
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

  // Extract credential IDs from vp_token keys (for unencrypted responses)
  // For encrypted responses (dc_api.jwt), this will be validated after
  // decryption. Support vp_token at top level or nested in data (wallet
  // forward compatibility).
  let vpTokenCredentialIds = [];
  const vpTokenForIds = actualResponseBody?.vp_token ||
    actualResponseBody?.data?.vp_token;
  if(vpTokenForIds && typeof vpTokenForIds === 'object' &&
    vpTokenForIds !== null) {
    vpTokenCredentialIds = Object.keys(vpTokenForIds);
  }

  // Verify that vp_token credential IDs exist in dcql_query
  if(vpTokenCredentialIds.length > 0) {
    const missingIds = vpTokenCredentialIds.filter(
      id => !credentialIds.includes(id)
    );
    if(missingIds.length > 0) {
      const availableIds = credentialIds.join(', ');
      const receivedIds = vpTokenCredentialIds.join(', ');
      throw new Error(
        `Credential IDs in vp_token [${receivedIds}] not found in ` +
        `dcql_query. Available credential IDs: ${availableIds}`
      );
    }
  }

  // Handle response based on response_mode
  let vpTokenString;
  let decryptedPayload;

  if(responseMode === 'dc_api.jwt') {
    // dc_api.jwt mode: encrypted response expected
    if(!privateKeyJwk) {
      throw new Error(
        'Ephemeral key agreement private key required for dc_api.jwt mode'
      );
    }
    try {
      // Extract JWT from response (could be in response property or direct)
      const jwt = actualResponseBody.response || actualResponseBody;
      if(typeof jwt !== 'string') {
        throw new Error('Expected JWT string in response body for dc_api.jwt');
      }

      // Import the private key JWK for decryption
      const privateKey = await importJWK(privateKeyJwk, 'ECDH-ES');

      const result = await jwtDecrypt(jwt, privateKey, {
        contentEncryptionAlgorithms: ['A128GCM', 'A256GCM'],
        keyManagementAlgorithms: ['ECDH-ES']
      });
      decryptedPayload = result.payload;

      // Extract vp_token from decrypted payload (top level or nested in data)
      const vpToken = decryptedPayload.vp_token ||
        decryptedPayload.data?.vp_token;
      if(!vpToken) {
        throw new Error('vp_token not found in decrypted response');
      }

      // Handle vp_token format (could be string or object with credential IDs)
      if(typeof vpToken === 'string') {
        vpTokenString = vpToken;
      } else if(typeof vpToken === 'object' && vpToken !== null) {
        // Extract vp_token by credential ID from dcql_query
        // Use first credential ID (credentialIds already validated above)
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
      logger.error('Failed to decrypt authorization response:', error);
      throw new Error(`Failed to decrypt authorization response: ${
        error.message}`);
    }
  } else if(responseMode === 'dc_api') {
    // dc_api mode: unencrypted expected, but auto-detect encryption
    // Extract vp_token from DC API structure (top level or nested in data)
    const vpToken = actualResponseBody.vp_token ||
      actualResponseBody.data?.vp_token;
    if(!vpToken) {
      throw new Error('vp_token not found in DC API response');
    }

    // Handle vp_token format (object with credential IDs as keys)
    if(typeof vpToken === 'object' && vpToken !== null) {
      // Extract vp_token by credential ID from dcql_query
      // Use first credential ID (credentialIds already validated above)
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
    } else if(typeof vpToken === 'string') {
      vpTokenString = vpToken;
    } else {
      throw new Error(
        'Expected vp_token to be string or object in DC API response');
    }

    // Auto-detect encryption: check if vp_token string is encrypted
    // Helper function to check if JWT is encrypted
    const _isEncryptedJWT = jwtString => {
      const parts = jwtString.split('.');
      return parts.length === 5; // Encrypted JWT has 5 parts
    };

    if(typeof vpTokenString === 'string' && _isEncryptedJWT(vpTokenString)) {
      // Wallet encrypted the response even though we didn't request it
      // Decrypt it using the ephemeral key agreement private key
      if(!privateKeyJwk) {
        throw new Error(
          'Ephemeral key agreement private key required for encrypted response'
        );
      }
      try {
        const privateKey = await importJWK(privateKeyJwk, 'ECDH-ES');
        const result = await jwtDecrypt(vpTokenString, privateKey, {
          contentEncryptionAlgorithms: ['A128GCM', 'A256GCM'],
          keyManagementAlgorithms: ['ECDH-ES']
        });
        decryptedPayload = result.payload;

        // Extract vp_token from decrypted payload (top level or nested in data)
        const decryptedVpToken = decryptedPayload.vp_token ||
          decryptedPayload.data?.vp_token;
        if(!decryptedVpToken) {
          throw new Error('vp_token not found in decrypted response');
        }

        // Handle decrypted vp_token format
        if(typeof decryptedVpToken === 'string') {
          vpTokenString = decryptedVpToken;
        } else if(typeof decryptedVpToken === 'object' &&
          decryptedVpToken !== null) {
          // Extract by credential ID again if it's an object
          // Use first credential ID (credentialIds already validated above)
          const credentialId = credentialIds[0];
          vpTokenString = decryptedVpToken[credentialId];
          if(!vpTokenString) {
            const availableIds = Object.keys(decryptedVpToken).join(', ');
            const queryIds = credentialIds.join(', ');
            throw new Error(
              `Credential ID "${credentialId}" not found in decrypted ` +
              `vp_token. Available IDs in response: ` +
              `${availableIds || 'none'}. Expected IDs from query: ${queryIds}`
            );
          }
        } else {
          throw new Error(
            'Expected vp_token to be string or object in decrypted response');
        }
      } catch(error) {
        logger.error('Failed to decrypt auto-detected encrypted response:',
          error);
        throw new Error(
          `Failed to decrypt encrypted response (auto-detected): ${
            error.message}`);
      }
    }
    // If not encrypted, vpTokenString is already set above
  } else {
    throw new Error(
      `Unsupported response_mode: ${responseMode}. ` +
      `Expected 'dc_api' or 'dc_api.jwt'`);
  }

  // Ensure we have a vp_token string at this point
  if(!vpTokenString || typeof vpTokenString !== 'string') {
    throw new Error(
      'Expected vp_token to be a base64url-encoded string for mdoc'
    );
  }

  // Handle mdoc format
  // vp_token should be base64url-encoded DeviceResponse for mdoc
  // Decode base64url DeviceResponse
  const deviceResponse = base64url.decode(vpTokenString);

  // Use stored session transcript if available (preferred method)
  // Otherwise fall back to reconstruction for backward compatibility
  let encodedSessionTranscript = exchange.variables?.encodedSessionTranscript;

  if(!encodedSessionTranscript) {
    logger.warning('Session transcript not found in exchange variables.');

    // Reconstruct session transcript based on response mode
    if(!responseMode) {
      throw new Error('response_mode not found in authorization request');
    }

    const nonce = authorizationRequest.nonce;
    if(!nonce) {
      throw new Error('nonce not found in authorization request');
    }

    let jwkThumbprint = null;
    let origin;
    let clientId;
    let responseUri = null;

    if(responseMode === 'dc_api' || responseMode === 'dc_api.jwt') {
      // DC API mode: use OpenID4VPDCAPIHandover
      // Extract origin from expected_origins
      const expectedOrigins = authorizationRequest.expected_origins;
      if(!expectedOrigins || expectedOrigins.length === 0) {
        throw new Error(
          'expected_origins not found in authorization request ' +
          'for DC API mode'
        );
      }
      origin = expectedOrigins[0];
      // Ensure origin is a plain string (not prefixed with 'origin:')
      if(origin.startsWith('origin:')) {
        origin = origin.substring(7);
      }

      // Calculate JWK thumbprint for dc_api.jwt mode
      if(responseMode === 'dc_api.jwt') {
        const publicKeyJwk =
          exchange.variables?.ephemeralKeyAgreementPublicKey;
        if(!publicKeyJwk) {
          throw new Error(
            'ephemeralKeyAgreementPublicKey not found in ' +
            'exchange variables. It should have been stored during ' +
            'authorization request.'
          );
        }
        jwkThumbprint = await _calculateJwkThumbprint(publicKeyJwk);
      }
    } else if(responseMode === 'direct_post') {
      // Redirect mode: use OpenID4VPHandover
      clientId = authorizationRequest.client_id;
      if(!clientId) {
        throw new Error('client_id not found in authorization request');
      }
      responseUri = authorizationRequest.response_uri || null;

      // Calculate JWK thumbprint if response is encrypted
      // (direct_post.jwt)
      // Note: direct_post.jwt is not currently supported,
      // but handle for future
      if(responseMode === 'direct_post.jwt') {
        const publicKeyJwk =
          exchange.variables?.ephemeralKeyAgreementPublicKey;
        if(publicKeyJwk) {
          jwkThumbprint = await _calculateJwkThumbprint(publicKeyJwk);
        }
      }
    } else {
      throw new Error(
        `Unsupported response_mode: ${responseMode}. ` +
        `Expected 'dc_api', 'dc_api.jwt', or 'direct_post'`
      );
    }

    // Encode session transcript using legacy method
    encodedSessionTranscript = _encodeSessionTranscript({
      responseMode,
      origin,
      clientId,
      nonce,
      responseUri,
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
    const credentialId = `data:application/mdl;base64,${b64Mdl}`;
    const credentialSubject = buildMdocCredentialSubject(verifiedMdoc,
      credentialId);
    verifiablePresentation = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: 'VerifiablePresentation',
      verifiableCredential: [{
        id: credentialId,
        type: 'EnvelopedVerifiableCredential',
        credentialSubject
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

