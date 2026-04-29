/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  msoMdocFormatLegacy,
  msoMdocFormatOid4vp10
} from './oid4vp-formats.js';

/**
 * Normalize `encryptionJwks` into a JWKS object `{ keys: [...] }`.
 * If the value already has a `keys` array (JWKS), that array is reused;
 * otherwise the value is treated as a single JWK and wrapped.
 *
 * @param {object} encryptionJwks - JWKS or single JWK.
 * @returns {{ keys: object[] }} JWKS with a `keys` array.
 */
function _jwksFromEncryptionInput(encryptionJwks) {
  if(Array.isArray(encryptionJwks.keys)) {
    return {keys: [...encryptionJwks.keys]};
  }
  return {keys: [encryptionJwks]};
}

/**
 * @param {string} [clientName] - Optional display name.
 * @returns {object} `client_name` entry or empty object.
 */
function _optionalClientName(clientName) {
  return typeof clientName === 'string' ? {client_name: clientName} : {};
}

function _annexDClientMetadata({clientName}) {
  return Object.freeze({
    ..._optionalClientName(clientName),
    vp_formats_supported: {
      mso_mdoc: msoMdocFormatOid4vp10()
    }
  });
}

function _annexCClientMetadata({clientName}) {
  return Object.freeze({
    ..._optionalClientName(clientName),
    vp_formats_supported: {
      mso_mdoc: msoMdocFormatOid4vp10()
    }
  });
}

function _haipClientMetadata({encryptionJwks, clientName}) {
  const base = {
    ..._optionalClientName(clientName),
    vp_formats_supported: {
      mso_mdoc: msoMdocFormatOid4vp10()
    },
    encrypted_response_enc_values_supported: ['A128GCM', 'A256GCM']
  };
  if(encryptionJwks != null && typeof encryptionJwks === 'object') {
    base.jwks = _jwksFromEncryptionInput(encryptionJwks);
  }
  return Object.freeze(base);
}

function _googleWalletClientMetadata({encryptionJwks, clientName}) {
  const base = {
    ..._optionalClientName(clientName),
    vp_formats_supported: {
      mso_mdoc: msoMdocFormatOid4vp10()
    }
  };
  if(encryptionJwks != null && typeof encryptionJwks === 'object') {
    base.jwks = _jwksFromEncryptionInput(encryptionJwks);
  }
  return Object.freeze(base);
}

/**
 * Standard OID4VP paths: legacy `vp_formats` until a follow-up upgrades.
 *
 * @param {object} options - Options.
 * @param {string} [options.clientName] - Optional `client_name`.
 * @returns {object} Frozen metadata with legacy `vp_formats`.
 */
function _standardClientMetadata({clientName}) {
  return Object.freeze({
    ..._optionalClientName(clientName),
    vp_formats: {
      mso_mdoc: msoMdocFormatLegacy()
    }
  });
}

/**
 * Build a `client_metadata` object for a given profile.
 *
 * @param {object} options - Options.
 * @param {string} options.profile - Profile identifier (see
 *   `identify-profile.js` for canonical values).
 * @param {object} [options.encryptionJwks] - JWKS or single JWK for response
 *   encryption (HAIP, google-wallet); ignored for other profiles.
 * @param {string} [options.clientName] - Optional `client_name`.
 * @returns {object} Shallow-frozen `client_metadata` payload.
 */
export function buildClientMetadata({
  profile,
  encryptionJwks,
  clientName
}) {
  switch(profile) {
    case '18013-7-Annex-D':
      return _annexDClientMetadata({clientName});
    case '18013-7-Annex-C':
      return _annexCClientMetadata({clientName});
    case 'OID4VP-HAIP-1.0':
      return _haipClientMetadata({encryptionJwks, clientName});
    case 'google-wallet':
      return _googleWalletClientMetadata({encryptionJwks, clientName});
    default:
      return _standardClientMetadata({clientName});
  }
}
