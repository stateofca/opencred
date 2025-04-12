import {getDocumentLoader} from '../../common/documentLoader.js';

const builder = getDocumentLoader();

builder.addStatic(
  'https://www.w3.org/ns/credentials/examples/v2',
  {
    '@context': {
      '@vocab': 'https://www.w3.org/ns/credentials/examples#'
    }
  });

export const documentLoader = builder.build();
