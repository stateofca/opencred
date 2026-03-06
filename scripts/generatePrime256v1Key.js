/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

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

/**
 * Generate a self-signed X.509 certificate with SAN DNS for the given domain,
 * using the provided ES256 private key.
 *
 * @param {string} privateKeyPem - PEM-encoded private key.
 * @param {string} domain - Domain for Subject Alternative Name (SAN).
 * @returns {Promise<string>} PEM-encoded certificate.
 */
export const generateCertificateForKey = (privateKeyPem, domain) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencred-cert-'));
  try {
    const keyPath = path.join(workDir, 'key.pem');
    const configPath = path.join(workDir, 'cert.cnf');
    const certPath = path.join(workDir, 'cert.pem');

    fs.writeFileSync(keyPath, privateKeyPem);

    const certConfig = `[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_ca
prompt = no

[req_distinguished_name]
C = US
ST = CA
L = San Francisco
O = OpenCred
CN = ${domain}

[v3_ca]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${domain}
`;
    fs.writeFileSync(configPath, certConfig);

    const result = spawnSync('openssl', [
      'req', '-new', '-x509',
      '-key', keyPath,
      '-out', certPath,
      '-days', '3650',
      '-config', configPath
    ], {encoding: 'utf8'});

    if(result.status !== 0) {
      const msg = result.stderr || result.error?.message || 'unknown error';
      throw new Error(`openssl failed: ${msg}`);
    }

    return fs.readFileSync(certPath, 'utf8');
  } finally {
    fs.rmSync(workDir, {recursive: true, force: true});
  }
};

function parseArgs(argv) {
  const purposes = [];
  let domain = null;
  for(const arg of argv) {
    if(arg.startsWith('--domain=')) {
      domain = arg.slice('--domain='.length);
    } else if(!arg.startsWith('--')) {
      purposes.push(arg);
    }
  }
  return {purposes, domain};
}

if(import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {purposes, domain} = parseArgs(process.argv.slice(2));

  if(purposes.length === 0) {
    console.error(
      'No purposes for key found!\n\n' +
      'Usage: npm run generate:prime256v1 <purpose1> <purpose2> ... ' +
      '[--domain=<domain>]\n\n' +
      '  --domain  When provided, generates a self-signed certificate with ' +
      'SAN DNS\n            for the domain (required for DC API / ' +
      'x509_san_dns client_id_scheme).'
    );
    process.exit(1);
  }

  (async () => {
    const {privateKey, publicKey} = await generateP256SigningKey();

    let certificatePem = null;
    if(domain) {
      try {
        certificatePem = await generateCertificateForKey(privateKey, domain);
      } catch(err) {
        console.error('Failed to generate certificate:', err.message);
        process.exit(1);
      }
    }

    const lines = [
      'Use config values:',
      'signingKeys:',
      '  - type: ES256',
      `    id: ${crypto.createHash('sha256').update(publicKey).digest('hex')}`,
      '    privateKeyPem: |',
      ...privateKey.split('\n').map(line => `      ${line}`),
      '    publicKeyPem: |',
      ...publicKey.split('\n').map(line => `      ${line}`)
    ];

    if(certificatePem) {
      lines.push('    certificatePem: |');
      lines.push(...certificatePem.split('\n').map(line => `      ${line}`));
    }

    lines.push('    purpose:');
    lines.push(...purposes.map(p => `      - ${p}`));

    console.log(lines.join('\n'));
  })();
}

