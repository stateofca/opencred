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
 * If there is a "didWeb" section in the config, return the document
 * @param {Request} req - Express Request object
 * @param {Response} res - Express Response object
 */
export const didWebDocument = async (req, res) => {
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
            id: `${domainToDidWeb(config.opencred.domain)}#${authzReqKey.id}`,
            controller: domainToDidWeb(config.opencred.domain),
            type: 'JsonWebKey2020',
            publicKeyJwk: {
              ...(await exportJWK(key))
            }
          }
        ],
        assertionMethod: [
          ...config.opencred.didWeb.mainDocument.assertionMethod ?? [],
          `${domainToDidWeb(config.opencred.domain)}#${authzReqKey.id}`
        ]
      };
      res.send(doc);
      return;
    }
    const doc = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: domainToDidWeb(config.opencred.domain),
      verificationMethod: [
        {
          id: `${domainToDidWeb(config.opencred.domain)}#${authzReqKey.id}`,
          controller: domainToDidWeb(config.opencred.domain),
          type: 'JsonWebKey2020',
          publicKeyJwk: {
            ...(await exportJWK(key))
          }
        }
      ],
      assertionMethod: [
        `${domainToDidWeb(config.opencred.domain)}#${authzReqKey.id}`
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

