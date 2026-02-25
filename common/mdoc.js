/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Builds a flat credentialSubject from verified MDoc for OIDC id_token claims.
 * Extracts claims from all documents and namespaces, using full namespace.field
 * as keys for multiple mDoc schemas.
 *
 * @param {object} verifiedMdoc - MDoc from Verifier.verify().
 * @param {string} credentialId - Credential identifier.
 * @returns {object} Flat credentialSubject with id and namespace.field keys.
 */
export function buildMdocCredentialSubject(verifiedMdoc, credentialId) {
  const credentialSubject = {id: credentialId};

  const documents = verifiedMdoc?.documents;
  if(!documents || !Array.isArray(documents)) {
    return credentialSubject;
  }

  for(const document of documents) {
    const namespaces = document.issuerSignedNameSpaces;
    if(!namespaces || !Array.isArray(namespaces)) {
      continue;
    }

    for(const namespace of namespaces) {
      let namespaceData;
      try {
        namespaceData = document.getIssuerNameSpace(namespace);
      } catch {
        continue;
      }

      if(!namespaceData || typeof namespaceData !== 'object') {
        continue;
      }

      for(const [field, value] of Object.entries(namespaceData)) {
        const key = `${namespace}.${field}`;
        credentialSubject[key] = value;
      }
    }
  }

  return credentialSubject;
}
