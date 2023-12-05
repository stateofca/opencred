import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const generateP256SigningKey = () => {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: {
        format: 'pem',
        type: 'pkcs8'
      },
      publicKeyEncoding: {
        format: 'pem',
        type: 'spki'
      }
    }, (err, publicKey, privateKey) => {
      if(err) {
        console.error('Error generating P-256 key pair:', err);
        return reject(err);
      }
      resolve({privateKey, publicKey});
    });
  });
};

if(import.meta.url === pathToFileURL(process.argv[1]).href) {
  const purposes = process.argv.slice(2);
  if(purposes.length === 0) {
    console.error('No purposes for key found! \n\n' +
    'Usage: `npm run generate:prime256v1 <purpose1> <purpose2> ...`');
  } else {
    (async () => {
      const {privateKey, publicKey} = await generateP256SigningKey();
      console.log([
        'Use config values:',
        'signingKeys:',
        '  - type: ES256',
        `    id: ${crypto
          .createHash('sha256').update(publicKey).digest('hex')}`,
        '    privateKeyPem: |',
        '      ' + privateKey
          .split('\n').map(line => `      ${line}`).join('\n').trim(),
        '    publicKeyPem: |',
        '      ' + publicKey
          .split('\n').map(line => `      ${line}`).join('\n').trim(),
        '    purpose:',
        ...purposes.map(p => `      - ${p}`)
      ].join('\n'));
    })();
  }
}
