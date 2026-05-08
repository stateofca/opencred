/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as base64url from 'base64url-universal';
import {
  _buildDcqlQueryForMdoc, _getX5cFromSigningKey
} from '../common/oid4vp-shared.js';
import {
  Aes128Gcm,
  CipherSuite,
  DhkemP256HkdfSha256,
  HkdfSha256
} from '@hpke/core';
import {
  buildDeviceRequest,
  buildItemsRequest,
  buildItemsRequestBytesList
} from '../common/mdoc-device-request.js';
import {
  DataItem,
  Verifier
} from '@auth0/mdl';
import {
  exportJWK,
  generateKeyPair
} from 'jose';
import {
  getWalletCertificatesByWallet,
  loadWalletCertEntry,
  ReaderAuthConfigError
} from '../common/wallet-certificates.js';
import {buildAnnexCDcApiRequest} from '../common/dc-api-envelope.js';
import {buildClientMetadata} from '../common/client-metadata.js';
import {buildMdocCredentialSubject} from '../../../common/mdoc.js';
import {decode as cborDecode} from 'cbor-x';
import {cborEncode} from '@auth0/mdl/lib/cbor/index.js';
import {config} from '@bedrock/core';
import {createId} from '../../../common/utils.js';
import crypto from 'node:crypto';
import {logger} from '../../logger.js';
import {serializeOrigin} from '../common/serialize-origin.js';
import {signReaderAuthAll} from '../common/mdoc-reader-auth.js';

/**
 * Create session transcript for Annex C DC API mode.
 *
 * Returns both the plain CBOR encoding (for HPKE info parameter) and the
 * tag-24 wrapped encoding (for @auth0/mdl mdoc verification).
 *
 * @param {string} base64EncryptionInfo - Base64url-encoded EncryptionInfo.
 * @param {string} serializedOrigin - Serialized origin (e.g., "https://example.com").
 * @returns {{hpkeInfoBytes: Uint8Array, encodedSessionTranscript:
 *   Uint8Array}} - Transcript.
 */
function _createSessionTranscriptAnnexC(
  base64EncryptionInfo, serializedOrigin) {
  const dcapiInfo = [base64EncryptionInfo, serializedOrigin];
  const dcapiInfoBytes = cborEncode(dcapiInfo);

  const hash = crypto.createHash('sha256');
  hash.update(dcapiInfoBytes);
  const dcapiInfoHash = new Uint8Array(hash.digest());

  const sessionTranscript = [null, null, ['dcapi', dcapiInfoHash]];

  // Plain CBOR encoding for HPKE info parameter (no tag-24).
  // The reference implementation (Apple VW3 MultipazResponseService.kt)
  // uses Cbor.encode(sessionTranscript) — plain CBOR, no wrapping.
  const hpkeInfoBytes = new Uint8Array(cborEncode(sessionTranscript));

  // Tag-24 wrapped encoding for @auth0/mdl verification.
  // The nested DataItem.fromData pattern produces #6.24(bstr .cbor value)
  // as required by ISO/IEC 18013-5 §9.1.5 for DeviceAuthentication.
  const encoded = DataItem.fromData(sessionTranscript);
  const encodedSessionTranscript = DataItem.fromData(encoded).buffer;

  return {hpkeInfoBytes, encodedSessionTranscript};
}

/**
 * Convert JWK to COSE_Key format (EC2 for P-256).
 *
 * @param {object} publicKeyJwk - Public key in JWK format.
 * @returns {Map} COSE_Key in EC2 format.
 */
function _jwkToCoseKey(publicKeyJwk) {
  if(publicKeyJwk.kty !== 'EC' || publicKeyJwk.crv !== 'P-256') {
    throw new Error('Only P-256 EC keys are supported for Annex C');
  }

  // COSE_Key EC2 format per RFC 9052 §7:
  // Keys MUST be integers; x/y values MUST be bstr.
  const x = base64url.decode(publicKeyJwk.x);
  const y = base64url.decode(publicKeyJwk.y);

  // Key type definitions,
  // https://datatracker.ietf.org/doc/rfc9053/ §7.1.1:
  return new Map([
    [1, 2], // kty: EC2
    [-1, 1], // crv: P-256
    [-2, new Uint8Array(x)], // x coordinate
    [-3, new Uint8Array(y)] // y coordinate
  ]);
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
 * @returns {Promise<object>} Object containing dcApiRequest, updatedExchange,
 *   and signingMetadata.
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
    nonce,
    recipientPublicKey
  };
  const encryptionInfo = ['dcapi', encryptionParameters];

  // Encode EncryptionInfo as CBOR and base64url-encode
  const encryptionInfoCbor = cborEncode(encryptionInfo);
  const base64EncryptionInfo = base64url.encode(encryptionInfoCbor);

  const serializedOrigin = serializeOrigin(serverBaseUri);

  // Plain SessionTranscript tuple for ReaderAuth §9.1.4; must match the
  // handover material digested inside _createSessionTranscriptAnnexC.
  const dcapiInfoForTranscript = [base64EncryptionInfo, serializedOrigin];
  const dcapiInfoBytesForTranscript = cborEncode(dcapiInfoForTranscript);
  const sessionTranscriptHash = crypto.createHash('sha256');
  sessionTranscriptHash.update(dcapiInfoBytesForTranscript);
  const dcapiInfoHashForReaderAuth = new Uint8Array(
    sessionTranscriptHash.digest());
  const sessionTranscript = [
    null, null, ['dcapi', dcapiInfoHashForReaderAuth]];

  const itemsRequestList = buildItemsRequest({dcqlQuery: dcql_query});
  const itemsRequestBytesList = buildItemsRequestBytesList(
    {itemsRequestList});

  let readerAuthAll;
  if(profile === 'apple-wallet') {
    const entries = getWalletCertificatesByWallet('apple-wallet');
    if(entries.length === 0) {
      throw new ReaderAuthConfigError(
        'apple-wallet profile requires at least one walletCertificates ' +
        'entry with wallet="apple-wallet"'
      );
    }
    const loaded = await Promise.all(entries.map(loadWalletCertEntry));
    readerAuthAll = await signReaderAuthAll({
      entries: loaded,
      sessionTranscript,
      itemsRequestBytes: itemsRequestBytesList[0]
    });
  }

  const deviceRequestBytes = buildDeviceRequest({
    dcqlQuery: dcql_query,
    readerAuthAll
  });
  const base64DeviceRequest = base64url.encode(deviceRequestBytes);

  // Build client_metadata via the shared OID4VP 1.0 helper. Annex C
  // emits `vp_formats_supported.mso_mdoc` with COSE
  // `issuerauth_alg_values` / `deviceauth_alg_values` (per OID4VP 1.0).
  const client_metadata = buildClientMetadata({profile: '18013-7-Annex-C'});

  // Get x5c certificate chain (excluding trust anchor per HAIP)
  const x5c = _getX5cFromSigningKey(signingKey);

  // Build authorization request
  const authorizationRequest = {
    client_id: clientId,
    client_id_scheme: 'x509_san_dns',
    response_type: 'vp_token',
    response_mode: responseMode || 'dc_api',
    expected_origins: [serializedOrigin],
    nonce: exchange.challenge || await createId(),
    state: await createId(),
    dcql_query,
    client_metadata
  };

  const updatedExchange = {
    ...exchange,
    state: 'active',
    updatedAt: new Date(),
    variables: {
      ...exchange.variables,
      profile,
      authorizationRequest,
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

  const dcApiRequest = buildAnnexCDcApiRequest({
    deviceRequest: base64DeviceRequest,
    encryptionInfo: base64EncryptionInfo
  });

  return {
    dcApiRequest,
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

  // Extract Response from response body. ISO 18013-7 Annex C spells
  // the field `Response` (uppercase R), but the @spruceid Rust handler
  // — which currently works on iOS — expects lowercase `response`,
  // and observed Apple Wallet / CA DMV wallet behavior matches that.
  // Accept either spelling.
  const base64EncryptedResponse =
    actualResponseBody?.Response ?? actualResponseBody?.response;
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

  const serializedOrigin = serializeOrigin(
    authorizationRequest.expected_origins?.[0] || config.server.baseUri
  );

  // Recompute session transcript in both forms:
  // - hpkeInfoBytes: plain CBOR for HPKE info parameter
  // - encodedSessionTranscript: tag-24 wrapped for @auth0/mdl verify
  const {hpkeInfoBytes, encodedSessionTranscript} =
    _createSessionTranscriptAnnexC(base64EncryptionInfo, serializedOrigin);

  // Perform HPKE decryption
  // Parameters: Mode=Base, KEM=DHKEM_P256, KDF=HKDF_SHA256, AEAD=AES_128_GCM
  let deviceResponseBytes;
  try {
    const suite = new CipherSuite({
      kem: new DhkemP256HkdfSha256(),
      kdf: new HkdfSha256(),
      aead: new Aes128Gcm()
    });

    // Import the stored private JWK as a CryptoKey for HPKE decryption.
    const recipientKey = await suite.kem.importKey(
      'jwk', {...privateKeyJwk, key_ops: ['deriveBits']}, false
    );

    const enc = new Uint8Array(encryptedResponseData.enc);
    const ctx = await suite.createRecipientContext({
      recipientKey,
      enc,
      info: hpkeInfoBytes
    });

    const cipherText = new Uint8Array(encryptedResponseData.cipherText);
    const aad = new Uint8Array(0);
    deviceResponseBytes = new Uint8Array(await ctx.open(cipherText, aad));
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
          vpToken: base64url.encode(deviceResponseBytes)
        }
      }
    }
  };

  return {
    updatedExchange
  };
}

// Exported for unit testing; not part of the public API.
export {_jwkToCoseKey};

