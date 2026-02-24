/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as base64url from 'base64url-universal';
import * as hpke from 'hpke-js';
import {
  _buildDcqlQueryForMdoc, _getX5cFromSigningKey
} from './common-oid4vp.js';
import {decode as cborDecode, encode as cborEncode} from 'cbor-x';
import {exportJWK, generateKeyPair} from 'jose';
import {config} from '@bedrock/core';
import {createId} from '../../../common/utils.js';
import crypto from 'node:crypto';
import {DataItem} from '@auth0/mdl';
import {logger} from '../../logger.js';
import {Verifier} from '@auth0/mdl';

/**
 * Create session transcript for Annex C DC API mode.
 *
 * @param {string} base64EncryptionInfo - Base64url-encoded EncryptionInfo.
 * @param {string} serializedOrigin - Serialized origin (e.g., "https://example.com").
 * @returns {Uint8Array} Encoded session transcript.
 */
function _createSessionTranscriptAnnexC(
  base64EncryptionInfo, serializedOrigin) {
  // dcapiInfo = [Base64EncryptionInfo, SerializedOrigin]
  const dcapiInfo = [base64EncryptionInfo, serializedOrigin];

  // Encode dcapiInfo as CBOR
  const dcapiInfoBytes = cborEncode(dcapiInfo);

  // SHA-256 hash the CBOR-encoded dcapiInfo
  const hash = crypto.createHash('sha256');
  hash.update(dcapiInfoBytes);
  const dcapiInfoHash = new Uint8Array(hash.digest());

  // SessionTranscript = [null, null, ["dcapi", dcapiInfoHash]]
  const sessionTranscript = [null, null, ['dcapi', dcapiInfoHash]];

  // Double-encode as per spec:
  // SessionTranscriptBytes = #6.24(bstr .cbor SessionTranscript)
  const encoded = DataItem.fromData(sessionTranscript);
  return DataItem.fromData(encoded).buffer;
}

/**
 * Convert JWK to COSE_Key format (EC2 for P-256).
 *
 * @param {object} publicKeyJwk - Public key in JWK format.
 * @returns {object} COSE_Key in EC2 format.
 */
function _jwkToCoseKey(publicKeyJwk) {
  if(publicKeyJwk.kty !== 'EC' || publicKeyJwk.crv !== 'P-256') {
    throw new Error('Only P-256 EC keys are supported for Annex C');
  }

  // COSE_Key EC2 format: {1: 2 (kty: EC2), -1: 1 (crv: P-256), -2: x, -3: y}
  // Convert base64url coordinates to bytes
  const x = base64url.decode(publicKeyJwk.x);
  const y = base64url.decode(publicKeyJwk.y);

  return {
    1: 2, // kty: EC2
    '-1': 1, // crv: P-256
    '-2': Array.from(x), // x coordinate as byte array
    '-3': Array.from(y) // y coordinate as byte array
  };
}

/**
 * Build DeviceRequest CBOR structure from DCQL query
 * This is a simplified version - in production, this should properly
 * construct the full DeviceRequest structure per ISO/IEC 18013-5.
 *
 * @param {object} dcqlQuery - DCQL query object.
 * @returns {Uint8Array} CBOR-encoded DeviceRequest.
 */
function _buildDeviceRequest(dcqlQuery) {
  // For now, create a minimal DeviceRequest structure
  // In production, this should be properly constructed from the DCQL query
  // per ISO/IEC 18013-5 DeviceRequest specification

  // Extract doctype from first credential's meta
  const firstCred = dcqlQuery.credentials?.[0];
  const doctypeValue = firstCred?.meta?.doctype_value ||
    'org.iso.18013.5.1.mDL';

  // Build ItemsRequest from claims
  const itemsRequest = {
    docType: doctypeValue,
    nameSpaces: {}
  };

  // Extract namespace and field mappings from claims
  if(firstCred?.claims) {
    for(const claim of firstCred.claims) {
      const path = claim.path;
      if(Array.isArray(path) && path.length >= 2) {
        const namespace = path[0];
        const fieldName = path[1];
        if(!itemsRequest.nameSpaces[namespace]) {
          itemsRequest.nameSpaces[namespace] = [];
        }
        itemsRequest.nameSpaces[namespace].push(fieldName);
      }
    }
  }

  // Build DocRequest
  const docRequest = {
    itemsRequest
  };

  // Build DeviceRequest
  const deviceRequest = {
    version: '1.1',
    docRequests: [docRequest]
  };

  // Encode as CBOR
  return new Uint8Array(cborEncode(deviceRequest));
}

/**
 * Generate authorization request for 18013-7-Annex-C profile with HPKE
 * encryption. Useful for Apple Wallet.
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

  // Generate HPKE recipient key pair (P-256)
  const hpkeKeyPair = await generateKeyPair('ECDH-ES', {
    crv: 'P-256',
    extractable: true
  });

  const [privateKeyJwk, publicKeyJwk] = await Promise.all([
    exportJWK(hpkeKeyPair.privateKey),
    exportJWK(hpkeKeyPair.publicKey)
  ]);

  // Set required properties
  publicKeyJwk.use = 'enc';
  publicKeyJwk.alg = 'ECDH-ES';
  const kid = `urn:uuid:${crypto.randomUUID()}`;
  privateKeyJwk.kid = publicKeyJwk.kid = kid;

  // Generate 16+ byte random nonce
  const nonce = crypto.randomBytes(16);

  // Convert public key to COSE_Key format
  const recipientPublicKey = _jwkToCoseKey(publicKeyJwk);

  // Build EncryptionInfo:
  // ["dcapi", {nonce: bstr, recipientPublicKey: COSE_Key}]
  const encryptionParameters = {
    nonce: Array.from(nonce),
    recipientPublicKey
  };
  const encryptionInfo = ['dcapi', encryptionParameters];

  // Encode EncryptionInfo as CBOR and base64url-encode
  const encryptionInfoCbor = cborEncode(encryptionInfo);
  const base64EncryptionInfo = base64url.encode(encryptionInfoCbor);

  // Build DeviceRequest from DCQL query
  const deviceRequestBytes = _buildDeviceRequest(dcql_query);
  const base64DeviceRequest = base64url.encode(deviceRequestBytes);

  // Build client_metadata
  // Annex-C uses vp_formats (legacy format)
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

  // Create session transcript for Annex C
  // SerializedOrigin is the ASCII serialization of the origin
  const serializedOrigin = serverBaseUri;
  const encodedSessionTranscript = _createSessionTranscriptAnnexC(
    base64EncryptionInfo,
    serializedOrigin
  );

  // Store state in exchange variables
  const updatedExchange = {
    ...exchange,
    state: 'active',
    updatedAt: new Date(),
    variables: {
      ...exchange.variables,
      authorizationRequest,
      encodedSessionTranscript,
      hpkeRecipientPrivateKey: privateKeyJwk,
      base64EncryptionInfo,
      base64DeviceRequest
    }
  };

  // Return signing metadata for JWT signing
  const signingMetadata = {
    x5c,
    kid: `${hostname}#${signingKey.id}`,
    alg: signingKey.type
  };

  // Return Annex C request structure as JSON (same format as Spruce handler)
  return {
    annexCRequest: {
      deviceRequest: base64DeviceRequest,
      encryptionInfo: base64EncryptionInfo
    },
    updatedExchange,
    signingMetadata
  };
}

/**
 * Handle authorization response for 18013-7-Annex-C profile for Apple Wallet.
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

  // Handle DC API container structure
  // Check if responseBody is wrapped in DC API container
  let actualResponseBody = responseBody;
  if(responseBody && responseBody.protocol === 'org-iso-mdoc' &&
    responseBody.data) {
    // Extract data from DC API container
    actualResponseBody = responseBody.data;
  }

  // Extract Response from response body
  // Response structure: {Response: Base64EncryptedResponse}
  const base64EncryptedResponse = actualResponseBody?.Response;
  if(!base64EncryptedResponse || typeof base64EncryptedResponse !== 'string') {
    throw new Error('Response not found in response body or invalid format');
  }

  // Validate required exchange variables before attempting to decode response
  // This ensures proper error messages when prerequisites are missing
  const privateKeyJwk = exchange.variables?.hpkeRecipientPrivateKey;
  if(!privateKeyJwk) {
    throw new Error(
      'HPKE recipient private key not found in exchange variables'
    );
  }

  // Retrieve stored encryption info and origin for session transcript
  const base64EncryptionInfo = exchange.variables?.base64EncryptionInfo;
  if(!base64EncryptionInfo) {
    throw new Error('EncryptionInfo not found in exchange variables');
  }

  // Base64url-decode to get CBOR EncryptedResponse
  const encryptedResponseBytes = base64url.decode(base64EncryptedResponse);

  // Decode CBOR to get EncryptedResponse =
  // ["dcapi", {enc: bstr, cipherText: bstr}]
  let encryptedResponse;
  try {
    encryptedResponse = cborDecode(encryptedResponseBytes);
  } catch(error) {
    throw new Error(`Failed to decode EncryptedResponse: ${error.message}`);
  }

  if(!Array.isArray(encryptedResponse) || encryptedResponse.length !== 2 ||
     encryptedResponse[0] !== 'dcapi') {
    throw new Error('Invalid EncryptedResponse structure');
  }

  const encryptedResponseData = encryptedResponse[1];
  if(!encryptedResponseData.enc || !encryptedResponseData.cipherText) {
    throw new Error('Invalid EncryptedResponseData: missing enc or cipherText');
  }

  const serverBaseUri = authorizationRequest.expected_origins?.[0] ||
    config.server.baseUri;
  const serializedOrigin = serverBaseUri;

  // Reconstruct session transcript
  let encodedSessionTranscript = exchange.variables?.encodedSessionTranscript;
  if(!encodedSessionTranscript) {
    encodedSessionTranscript = _createSessionTranscriptAnnexC(
      base64EncryptionInfo,
      serializedOrigin
    );
  }

  // Perform HPKE decryption
  // Parameters: Mode=Base, KEM=DHKEM_P256, KDF=HKDF_SHA256, AEAD=AES_128_GCM
  let deviceResponseBytes;
  try {
    // Convert private key JWK to HPKE format
    // hpke-js expects the private key in a specific format
    const privateKeyBytes = base64url.decode(privateKeyJwk.d);

    // Import private key for HPKE
    // Note: hpke-js API may vary, adjust based on actual library API
    const kem = new hpke.DhkemP256HkdfSha256();
    const kdf = new hpke.HkdfSha256();
    const aead = new hpke.Aes128Gcm();

    // Create recipient context
    const recipient = new hpke.CipherSuite({
      kem,
      kdf,
      aead
    });

    // Setup receiver (decryption)
    // enc is the encapsulated public key from the response
    const enc = new Uint8Array(encryptedResponseData.enc);
    const skR = new Uint8Array(privateKeyBytes);
    const info = encodedSessionTranscript; // CBOR-encoded SessionTranscript
    const aad = new Uint8Array(0); // Empty AAD

    const receiver = recipient.setupBaseRecipient(enc, skR, info);

    // Decrypt ciphertext
    const cipherText = new Uint8Array(encryptedResponseData.cipherText);
    deviceResponseBytes = receiver.open(cipherText, aad);
  } catch(error) {
    logger.error('HPKE decryption failed:', error);
    throw new Error(`Failed to decrypt DeviceResponse: ${error.message}`);
  }

  // Verify mdoc using @auth0/mdl
  const trustedCertificates = config.opencred.caStore || [];
  if(trustedCertificates.length === 0) {
    throw new Error(
      'No trusted certificates configured in caStore for mdoc verification'
    );
  }

  let verifiedMdoc;
  let verifiablePresentation;
  try {
    const verifier = new Verifier(trustedCertificates);
    verifiedMdoc = await verifier.verify(deviceResponseBytes, {
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
          vpToken: base64url.encode(deviceResponseBytes)
        }
      }
    }
  };

  return {
    updatedExchange
  };
}

