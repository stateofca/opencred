import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const generateP256SigningKey = async callback => {
  crypto.generateKeyPair('ec',
    {
      namedCurve: 'prime256v1',
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
      callback({privateKey, publicKey});
    }
  );
};

if(import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateP256SigningKey(async ({privateKey, publicKey}) => {
    const privK = privateKey.toString('hex');
    const pubK = publicKey.toString('hex');

    console.log([
      'Use config values:',
      'signingKeys:',
      '  - type: ES256',
      '    privateKeyPem: >-',
      '      ' + privK.replaceAll('\n', '\n      ').trimEnd(),
      '    publicKeyPem: >-',
      '      ' + pubK.replaceAll('\n', '\n      ').trimEnd(),
      '    purpose:',
      '      - id_token'
    ].join('\n'));
  });
}
