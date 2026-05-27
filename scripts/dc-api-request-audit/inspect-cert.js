/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createHash} from 'node:crypto';
import {X509Certificate} from '@peculiar/x509';

/**
 * Inspect a single DER-encoded reader certificate.
 *
 * @param {object} options - Options object.
 * @param {Uint8Array} options.der - Leaf or intermediate cert DER.
 * @returns {{
 *   subjectCN: string|null,
 *   issuerCN: string|null,
 *   sanDnsNames: string[],
 *   notBefore: string,
 *   notAfter: string,
 *   signatureAlgorithm: string,
 *   sha256Fingerprint: string,
 *   serialNumber: string,
 *   keyAlgorithm: string
 * }} Parsed certificate summary fields.
 */
export function inspectCertificate({der}) {
  const cert = new X509Certificate(der);
  const sigAlg = cert.signatureAlgorithm;
  const hashName = sigAlg.hash?.name ?? 'UNKNOWN';
  const signatureAlgorithm =
    `${sigAlg.name.toLowerCase()}-with-${hashName}`;

  return {
    subjectCN: _extractCn(cert.subject),
    issuerCN: _extractCn(cert.issuer),
    sanDnsNames: _extractSanDns(cert),
    notBefore: cert.notBefore.toISOString(),
    notAfter: cert.notAfter.toISOString(),
    signatureAlgorithm,
    sha256Fingerprint: _sha256Fingerprint(der),
    serialNumber: cert.serialNumber,
    keyAlgorithm: _formatKeyAlgorithm(cert.publicKey.algorithm)
  };
}

/**
 * Inspect a full x5chain (leaf first).
 *
 * @param {object} options - Options object.
 * @param {Uint8Array|Uint8Array[]} options.x5chain - One DER or a
 *   leaf-first array (matches RFC 9360 x5chain).
 * @returns {{
 *   chainLength: number,
 *   leaf: ReturnType<typeof inspectCertificate>,
 *   intermediates: Array<{subjectCN: string, issuerCN: string}>
 * }} Parsed x5chain summary with leaf and intermediates.
 */
export function inspectX5Chain({x5chain}) {
  const chain = Array.isArray(x5chain) ? x5chain : [x5chain];
  const leaf = inspectCertificate({der: chain[0]});
  const intermediates = chain.slice(1).map(der => {
    const cert = new X509Certificate(der);
    return {
      subjectCN: _extractCn(cert.subject),
      issuerCN: _extractCn(cert.issuer)
    };
  });
  return {
    chainLength: chain.length,
    leaf,
    intermediates
  };
}

/**
 * @param {string} dn - Distinguished name string.
 * @returns {string|null} Common name value, if present.
 */
function _extractCn(dn) {
  const match = dn.match(/(?:^|,)\s*CN=([^,]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * @param {X509Certificate} cert - Parsed certificate.
 * @returns {string[]} Lower-case SAN DNS names.
 */
function _extractSanDns(cert) {
  const sanExt = cert.getExtension('2.5.29.17');
  if(!sanExt) {
    return [];
  }
  return sanExt.names.toJSON()
    .filter(name => name.type === 'dns')
    .map(name => name.value.toLowerCase());
}

/**
 * @param {Uint8Array} der - Certificate DER bytes.
 * @returns {string} Colon-separated SHA-256 fingerprint (hex).
 */
function _sha256Fingerprint(der) {
  const hex = createHash('sha256').update(Buffer.from(der)).digest('hex');
  return hex.match(/.{2}/g).join(':');
}

/**
 * @param {object} algorithm - WebCrypto-style algorithm object.
 * @returns {string} Human-readable key algorithm label.
 */
function _formatKeyAlgorithm(algorithm) {
  if(!algorithm) {
    return 'unknown';
  }
  const name = algorithm.name ?? 'unknown';
  if(algorithm.namedCurve) {
    return `${name} ${algorithm.namedCurve}`;
  }
  if(algorithm.modulusLength) {
    return `${name} ${algorithm.modulusLength}`;
  }
  return name;
}
