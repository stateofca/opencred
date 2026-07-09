/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  _buildDcqlQueryForMdoc, _calculateJwkThumbprint,
  _generateEphemeralKeyAgreementPair
} from '../common/oid4vp-shared.js';
import {
  computeX509HashClientId,
  getWalletCertificatesByWallet,
  loadWalletCertEntry,
  ReaderAuthConfigError
} from '../common/wallet-certificates.js';
import {buildAnnexDDcApiRequest} from '../common/dc-api-envelope.js';
import {buildClientMetadata} from '../common/client-metadata.js';
import {config} from '@bedrock/core';
import {createId} from '../../../common/utils.js';
import {encodeSessionTranscript} from '../common/session-transcript.js';
import {signJarJwt} from '../common/jar-signing.js';

// Re-export Annex D response handler — Google Wallet encrypted
// responses (dc_api.jwt) are structurally identical to Annex D's
// encrypted path.
export {handleAuthorizationResponse} from './native-18013-7-annex-d.js';

/**
 * Generate authorization request for the google-wallet profile.
 *
 * Loads the first matching walletCertificates entry, computes the
 * x509_hash client_id, generates an ephemeral encryption key pair,
 * builds a signed JAR envelope, and returns the DC API wire object.
 *
 * @param {object} options - Options object.
 * @param {object} options.workflow - The workflow configuration.
 * @param {object} options.exchange - The exchange object.
 * @param {string} [options.baseUri] - Base URI (defaults to
 *   config.server.baseUri).
 * @param {string} options.profile - Should be 'google-wallet'.
 * @param {string} options.responseMode - 'dc_api.jwt' (encrypted, default)
 *   or 'dc_api' (unencrypted). May be overridden by
 *   options.googleWalletRequest.responseMode.
 * @param {string} [options.walletNonce] - Wallet nonce from POST
 *   request (optional, per OID4VP 1.0 Section 5.10).
 * @returns {Promise<object>} Object containing dcApiRequest,
 *   authorizationRequest, updatedExchange, and signingMetadata.
 */
export async function generateAuthorizationRequest({
  workflow,
  exchange,
  baseUri,
  profile,
  responseMode,
  walletNonce
}) {
  const serverBaseUri = baseUri || config.server.baseUri;

  // Step 1: Load wallet certificate
  const certEntries = getWalletCertificatesByWallet('google-wallet');
  if(certEntries.length === 0) {
    throw new ReaderAuthConfigError(
      'No walletCertificates entries with wallet=google-wallet ' +
      'configured. Register a certificate with Google Wallet and ' +
      'add it to opencred.walletCertificates[].'
    );
  }
  const certEntry = certEntries[0];
  const loaded = await loadWalletCertEntry(certEntry);

  // Step 2: Compute x509_hash client_id from leaf DER cert
  const clientId = computeX509HashClientId(loaded.derChain[0]);

  // Experimental request-shaping knobs (options.googleWalletRequest).
  // Defaults preserve encrypted dc_api.jwt behavior. client_id_scheme is
  // always omitted: OID4VP 1.0 carries the scheme as the client_id prefix.
  const shaping = config.opencred.options?.googleWalletRequest ?? {};
  const effectiveResponseMode =
    shaping.responseMode || responseMode || 'dc_api.jwt';
  const useEncryption = effectiveResponseMode === 'dc_api.jwt';

  // Step 3: Generate ephemeral key pair + thumbprint only when the
  // response will be encrypted (dc_api.jwt).
  let privateKeyJwk;
  let publicKeyJwk;
  let jwkThumbprint = null;
  if(useEncryption) {
    ({privateKeyJwk, publicKeyJwk} =
      await _generateEphemeralKeyAgreementPair());
    jwkThumbprint = await _calculateJwkThumbprint(publicKeyJwk);
  }

  // Step 4: Build client_metadata; advertise the encryption key only
  // when encrypting, and include Google's RP metadata when configured.
  const client_metadata = buildClientMetadata({
    profile: 'google-wallet',
    rpMetadataBytes: certEntry.google?.rpMetadataBytes,
    ...(useEncryption ? {encryptionJwks: {keys: [publicKeyJwk]}} : {})
  });

  // Step 5: Build DCQL query
  const dcql_query = await _buildDcqlQueryForMdoc({
    workflow, exchange, profile
  });
  if(shaping.omitCredentialSets && dcql_query?.credential_sets) {
    delete dcql_query.credential_sets;
  }

  // Step 6: Build authorization request payload
  const authorizationRequest = {
    client_id: clientId,
    response_type: 'vp_token',
    response_mode: effectiveResponseMode,
    expected_origins: [serverBaseUri],
    nonce: exchange.challenge || await createId(),
    ...(shaping.omitState ? {} : {state: await createId()}),
    dcql_query,
    client_metadata,
    ...(walletNonce && {wallet_nonce: walletNonce})
  };

  // Step 7: Encode session transcript matching the response mode
  const encodedSessionTranscript = encodeSessionTranscript({
    responseMode: effectiveResponseMode,
    origin: serverBaseUri,
    nonce: authorizationRequest.nonce,
    jwkThumbprint: useEncryption ? jwkThumbprint : null
  });

  // Step 8: Prepare signing metadata from wallet cert
  // Convert DER chain to base64 strings for x5c header
  const x5c = loaded.derChain.map(
    der => Buffer.from(der).toString('base64')
  );
  const signingMetadata = {
    alg: 'ES256',
    kid: certEntry.id,
    x5c
  };

  // Step 9: Sign JAR JWT with wallet certificate key
  const signedJwt = await signJarJwt({
    authorizationRequest,
    signingKey: {
      privateKeyPem: certEntry.privateKeyPem,
      type: certEntry.type
    },
    kid: certEntry.id,
    signingMetadata
  });

  // Step 10: Build DC API envelope
  const dcApiRequest = buildAnnexDDcApiRequest({
    signed: true,
    signedJwt
  });

  // Step 11: Calculate updated exchange state. Ephemeral key material is
  // only stored for the encrypted path (used by the response handler).
  const updatedExchange = {
    ...exchange,
    state: 'active',
    updatedAt: new Date(),
    variables: {
      ...exchange.variables,
      profile,
      authorizationRequest,
      ...(useEncryption ? {
        ephemeralKeyAgreementPrivateKey: privateKeyJwk,
        ephemeralKeyAgreementPublicKey: publicKeyJwk
      } : {}),
      encodedSessionTranscript
    }
  };

  return {
    authorizationRequest,
    dcApiRequest,
    updatedExchange,
    signingMetadata
  };
}
