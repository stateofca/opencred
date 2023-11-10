import {config} from '../config/config.js';

/**
 * If there is a "didWeb" section in the config, return the document
 * @param {Request} req - Express Request object
 * @param {Response} res - Express Response object
 */
export const didWebDocument = (req, res) => {
  if(!config.didWeb?.enabled) {
    return res.status(404).send({
      message: 'A did:web document is not available for this domain.'
    });
  }
  if(config.domain.startsWith('http://')) {
    console.log('WARNING: did:web is not secure. Please use https://');
  }

  const doc = {
    '@context': [
      'https://www.w3.org/ns/did/v1'
    ],
    id: config.domain,
    service: [],
    verificationMethod: []
  };
  res.send(doc);
};
