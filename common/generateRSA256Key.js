/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const generateRSA256SigningKey = () => {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair('rsa',
      {
        modulusLength: 2048,
        privateKeyEncoding: {
          format: 'pem',
          type: 'pkcs8'
        },
        publicKeyEncoding: {
          format: 'pem',
          type: 'spki'
        }
      },
      (err, publicKey, privateKey) => {
        if(err) {
          console.error('Error generating RSA-256 key pair:');
          return reject(err);
        }
        resolve({privateKey, publicKey});
      }
    );
  });
};

if(import.meta.url === pathToFileURL(process.argv[1]).href) {
  const purposes = process.argv.slice(2);
  if(purposes.length === 0) {
    console.error('No purposes for key found! \n\n' +
    'Usage: `npm run generate:rsa256 <purpose1> <purpose2> ...`');
  } else {
    (async () => {
      const {privateKey, publicKey} = await generateRSA256SigningKey();
      console.log([
        'Use config values:',
        'signingKeys:',
        '  - type: RS256',
        `    id: ${crypto
          .createHash('sha256').update(publicKey).digest('hex')}`,
        '    privateKeyPem: |',
        '      ' + privateKey.replaceAll('\n', '\n      ').trimEnd(),
        '    publicKeyPem: |',
        '      ' + publicKey.replaceAll('\n', '\n      ').trimEnd(),
        '    purpose:',
        ...purposes.map(p => `      - ${p}`)
      ].join('\n'));
    })();
  }
}
