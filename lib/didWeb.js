/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {exportJWK, importSPKI} from 'jose';
import {config} from '@bedrock/core';

/**
 * Converts configured domain to DID web format.
 * @param {string} domain
 * @returns {string}
 */
export const domainToDidWeb = domain => {
  const didWeb = `did:web:${domain.replace(/^https?:\/\//, '')}`;
  return didWeb;
};

/**
 * Converts configured domain to DID web format with port colon percent-encoded.
 * Per DID Web spec, port colons MUST be percent-encoded in
 * client_id for wallet compatibility.
 * @param {string} domain
 * @returns {string}
 */
export const domainToDidWebEncoded = domain => {
  let hostPath = domain.replace(/^https?:\/\//, '');
  // Percent-encode port colon as required by DID Web specification
  // for client_id
  hostPath = hostPath.replace(/:(\d+)/, '%3A$1');
  // Convert path separators to colons as per DID Web specification
  const didWeb = `did:web:${hostPath.replace(/\//g, ':')}`;
  return didWeb;
};

/**
 * If there is a "didWeb" section in the config, return the document
 * @param {Request} req - Express Request object
 * @param {Response} res - Express Response object
 */
export const didWebDocument = async (req, res) => {
  const {server: {baseUri}} = config;

  if(!config.opencred.didWeb?.mainEnabled) {
    res.status(404).send({
      message: 'A did:web document is not available for this domain.'
    });
    return;
  }
  const authzReqKey = config.opencred.signingKeys
    .find(k => k.purpose?.includes('authorization_request'));
  if(authzReqKey) {
    const key = await importSPKI(authzReqKey.publicKeyPem, authzReqKey.type);
    if(Object.keys(config.opencred.didWeb?.mainDocument).length > 0) {
      const doc = {
        ...config.opencred.didWeb.mainDocument,
        verificationMethod: [
          ...config.opencred.didWeb.mainDocument.verificationMethod ?? [],
          {
            id: `${domainToDidWeb(baseUri)}#${authzReqKey.id}`,
            controller: domainToDidWeb(baseUri),
            type: 'JsonWebKey2020',
            publicKeyJwk: {
              ...(await exportJWK(key))
            }
          }
        ],
        assertionMethod: [
          ...config.opencred.didWeb.mainDocument.assertionMethod ?? [],
          `${domainToDidWeb(baseUri)}#${authzReqKey.id}`
        ]
      };
      res.send(doc);
      return;
    }
    const doc = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: domainToDidWeb(baseUri),
      verificationMethod: [
        {
          id: `${domainToDidWeb(baseUri)}#${authzReqKey.id}`,
          controller: domainToDidWeb(baseUri),
          type: 'JsonWebKey2020',
          publicKeyJwk: {
            ...(await exportJWK(key))
          }
        }
      ],
      assertionMethod: [
        `${domainToDidWeb(baseUri)}#${authzReqKey.id}`
      ]
    };
    res.send(doc);
    return;
  } else {
    if(config.opencred.didWeb?.mainDocument) {
      res.send(config.opencred.didWeb.mainDocument);
      return;
    }
    res.status(404).send({
      message: 'A did:web document is not available for this domain.'
    });
    return;
  }
};

export const didConfigurationDocument = async (req, res) => {
  if(!config.opencred.didWeb?.mainEnabled) {
    res.status(404).send({
      message: 'A did:web document is not available for this domain.'
    });
    return;
  }
  if(!config.opencred.didWeb?.linkageEnabled) {
    res.send({
      '@context':
        'https://identity.foundation/.well-known/did-configuration/v1',
      linked_dids: []
    });
    return;
  }

  res.send(config.opencred.didWeb?.linkageDocument);
};
