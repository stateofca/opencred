import {pathToFileURL} from 'node:url';

import {createId} from './utils.js';

export const generateEd25519Seed = async () => {
  const newSeed = await createId(256);
  return newSeed;
};

if(import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateEd25519Seed().then(seed => {
    console.log(seed);
    console.log([
      'Use config values:',
      'signingKeys:',
      '  - type: Ed25519VerificationKey2020',
      `    seed: ${seed}`,
      '    purpose:',
      '      - assertionMethod'
    ].join('\n'));
  });
}
