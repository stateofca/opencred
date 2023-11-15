import {config} from '../config/config.js';

/**
 * If there is a "didWeb" section in the config, return the document
 * @param {Request} req - Express Request object
 * @param {Response} res - Express Response object
 */
export const didWebDocument = async (req, res) => {
  if(!config.didWeb?.mainEnabled) {
    return res.status(404).send({
      message: 'A did:web document is not available for this domain.'
    });
  }

  res.send(config.didWeb?.mainDocument);
};

export const didConfigurationDocument = async (req, res) => {
  if(!config.didWeb?.mainEnabled) {
    return res.status(404).send({
      message: 'A did:web document is not available for this domain.'
    });
  }
  if(!config.didWeb?.linkageEnabled) {
    return res.send({
      '@context':
        'https://identity.foundation/.well-known/did-configuration/v1',
      linked_dids: []
    });
  }

  res.send(config.didWeb?.linkageDocument);
};
