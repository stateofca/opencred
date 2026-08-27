/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

// Mint a self-managed Reader CA + leaf certificate for OID4VP DC API reader
// authentication. The leaf carries the ISO mDL/mdoc reader-auth Extended Key
// Usages and a SAN DNS entry, matching the reader cert shape that Google Wallet
// accepts (see verifier.multipaz.org). DO NOT USE IN PRODUCTION — test only.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

// ISO/IEC 18013-5 mDL reader auth and ISO/IEC 23220-4 mdoc reader auth EKUs.
const MDL_READER_AUTH_EKU = '1.0.18013.5.1.6';
const MDOC_READER_AUTH_EKU = '1.0.23220.4.1.6';

const DEFAULT_DOMAIN = 'uat-credentials.dmv.ca.gov';

function runOpenssl(args, workDir) {
  const result = spawnSync('openssl', args, {encoding: 'utf8', cwd: workDir});
  if(result.status !== 0) {
    const msg = result.stderr || result.error?.message || 'unknown error';
    throw new Error(`openssl ${args[0]} failed: ${msg}`);
  }
  return result.stdout;
}

/**
 * Generate a self-managed Reader CA and a leaf certificate signed by it.
 *
 * The leaf has SAN DNS=<domain>, keyUsage=critical digitalSignature, and
 * extendedKeyUsage=critical {mDL, mdoc} reader auth. The leaf private key is
 * emitted as PKCS#8 (BEGIN PRIVATE KEY) for `jose` importPKCS8.
 *
 * @param {object} options - Options object.
 * @param {string} options.domain - SAN DNS for the leaf certificate.
 * @returns {{
 *   leafPrivateKeyPem: string,
 *   leafPublicKeyPem: string,
 *   leafCertPem: string,
 *   caCertPem: string,
 *   caPrivateKeyPem: string
 * }} Generated PEM material.
 */
export function generateReaderCertChain({domain}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencred-reader-'));
  try {
    const caKey = path.join(workDir, 'ca.key');
    const caCert = path.join(workDir, 'ca.crt');
    const caConfig = path.join(workDir, 'ca.cnf');
    const leafKey = path.join(workDir, 'leaf.key');
    const leafKeyPkcs8 = path.join(workDir, 'leaf.p8.key');
    const leafCsr = path.join(workDir, 'leaf.csr');
    const leafCert = path.join(workDir, 'leaf.crt');
    const leafExt = path.join(workDir, 'leaf.ext');

    fs.writeFileSync(caConfig, `[req]
distinguished_name = dn
x509_extensions = v3_ca
prompt = no

[dn]
C = US
ST = CA
O = OpenCred
CN = CA DMV Test Reader CA

[v3_ca]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
`);

    fs.writeFileSync(leafExt, `subjectAltName = DNS:${domain}
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, ${MDL_READER_AUTH_EKU}, ${MDOC_READER_AUTH_EKU}
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
`);

    // Reader CA: EC P-256, self-signed.
    runOpenssl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout',
      '-out', caKey], workDir);
    runOpenssl(['req', '-new', '-x509', '-key', caKey, '-out', caCert,
      '-days', '3650', '-config', caConfig], workDir);

    // Leaf: EC P-256, signed by the Reader CA.
    runOpenssl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout',
      '-out', leafKey], workDir);
    runOpenssl(['pkcs8', '-topk8', '-nocrypt', '-in', leafKey,
      '-out', leafKeyPkcs8], workDir);
    runOpenssl(['req', '-new', '-key', leafKey, '-out', leafCsr,
      '-subj', '/C=US/ST=CA/O=OpenCred/CN=CA DMV Reader'], workDir);
    runOpenssl(['x509', '-req', '-in', leafCsr, '-CA', caCert, '-CAkey', caKey,
      '-CAcreateserial', '-out', leafCert, '-days', '365',
      '-extfile', leafExt], workDir);

    const leafPublicKeyPem = runOpenssl(['ec', '-in', leafKey, '-pubout'],
      workDir);

    return {
      leafPrivateKeyPem: fs.readFileSync(leafKeyPkcs8, 'utf8'),
      leafPublicKeyPem,
      leafCertPem: fs.readFileSync(leafCert, 'utf8'),
      caCertPem: fs.readFileSync(caCert, 'utf8'),
      caPrivateKeyPem: fs.readFileSync(caKey, 'utf8')
    };
  } finally {
    fs.rmSync(workDir, {recursive: true, force: true});
  }
}

function indentBlock(pem, spaces) {
  const pad = ' '.repeat(spaces);
  return pem.trimEnd().split('\n').map(line => `${pad}${line}`).join('\n');
}

function parseArgs(argv) {
  let domain = DEFAULT_DOMAIN;
  for(const arg of argv) {
    if(arg.startsWith('--domain=')) {
      domain = arg.slice('--domain='.length);
    }
  }
  return {domain};
}

if(import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {domain} = parseArgs(process.argv.slice(2));

  const {
    leafPrivateKeyPem, leafPublicKeyPem, leafCertPem, caCertPem, caPrivateKeyPem
  } = generateReaderCertChain({domain});

  const id = crypto.createHash('sha256')
    .update(leafPublicKeyPem).digest('hex');

  // certificatePem is leaf-first, CA second. _getX5cFromSigningKey drops the
  // trust anchor (last cert) so the JAR x5c carries the leaf only.
  const certChain = `${leafCertPem.trimEnd()}\n${caCertPem.trimEnd()}\n`;

  const lines = [
    `# Reader cert for ${domain} (mDL/mdoc reader-auth EKUs). TEST ONLY.`,
    '# Add under app.opencred.signingKeys (replaces the prior',
    '# authorization_request key):',
    'signingKeys:',
    '  - type: ES256',
    `    id: ${id}`,
    '    privateKeyPem: |',
    indentBlock(leafPrivateKeyPem, 6),
    '    publicKeyPem: |',
    indentBlock(leafPublicKeyPem, 6),
    '    certificatePem: |',
    indentBlock(certChain, 6),
    '    purpose:',
    '      - authorization_request',
    '',
    '# --- Reader CA (keep offline; only needed to re-issue leaves) ---',
    '# CA certificate:',
    indentBlock(caCertPem, 0),
    '# CA private key:',
    indentBlock(caPrivateKeyPem, 0)
  ];

  console.log(lines.join('\n'));
}
