/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {parseCertificateChainPem} from './wallet-certificates.js';
import {X509Certificate} from '@peculiar/x509';

const EXPIRY_WARN_DAYS = 30;
const EXPIRY_WARN_MS = EXPIRY_WARN_DAYS * 24 * 60 * 60 * 1000;

/**
 * Validate parsed walletCertificates entries against the server's
 * base URI. Pure function; no I/O, no logging.
 *
 * @param {object} options - Options object.
 * @param {Array<object>} options.entries - Parsed config entries
 *   (each with `id`, `wallet`, `certificatePem` at minimum).
 * @param {string} options.baseUri - Value of `config.server.baseUri`.
 * @returns {{ok: boolean, results: Array<object>}} Per-entry
 *   summaries; `ok === true` iff no entry has warnings.
 */
export function validateWalletCertificates({entries, baseUri}) {
  const expectedHost = _hostnameFromBaseUri(baseUri);
  const results = (entries ?? []).map(entry =>
    _summarizeEntry({entry, expectedHost}));
  const ok = results.every(r => r.warnings.length === 0);
  return {ok, results};
}

/**
 * @param {object} options - Options object.
 * @param {object} options.entry - Parsed walletCertificates entry.
 * @param {string} options.expectedHost - Lower-case hostname from
 *   `baseUri`.
 * @returns {object} Per-entry summary with warnings.
 */
function _summarizeEntry({entry, expectedHost}) {
  const summary = {
    id: entry.id,
    wallet: entry.wallet,
    subjectCN: null,
    issuerCN: null,
    sanDnsNames: [],
    notBefore: null,
    notAfter: null,
    baseUriMatch: false,
    warnings: []
  };

  let derChain;
  try {
    derChain = parseCertificateChainPem(entry.certificatePem ?? '');
  } catch(err) {
    summary.warnings.push(
      `failed to parse leaf certificate: ${err.message}`);
    return summary;
  }

  if(derChain.length === 0) {
    summary.warnings.push('no parseable PEM blocks in certificatePem');
    return summary;
  }

  try {
    const cert = new X509Certificate(derChain[0]);
    summary.subjectCN = _extractCn(cert.subject);
    summary.issuerCN = _extractCn(cert.issuer);
    summary.sanDnsNames = _extractSanDns(cert);
    summary.notBefore = cert.notBefore;
    summary.notAfter = cert.notAfter;
    summary.baseUriMatch = summary.sanDnsNames.includes(expectedHost);

    if(!summary.baseUriMatch) {
      summary.warnings.push(
        `leaf SAN DNS names do not include ${expectedHost}`);
    }

    const now = Date.now();
    const notAfterMs = summary.notAfter.getTime();
    if(now > notAfterMs) {
      summary.warnings.push('leaf certificate is expired');
    } else {
      const msUntilExpiry = notAfterMs - now;
      if(msUntilExpiry > 0 && msUntilExpiry < EXPIRY_WARN_MS) {
        summary.warnings.push('leaf certificate expires within 30 days');
      }
    }
  } catch(err) {
    summary.warnings.push(
      `failed to parse leaf certificate: ${err.message}`);
  }

  return summary;
}

/**
 * @param {X509Certificate} cert - Parsed leaf certificate.
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
 * @param {string} dn - Distinguished name string.
 * @returns {string|null} Common name value, if present.
 */
function _extractCn(dn) {
  const match = dn.match(/(?:^|,)\s*CN=([^,]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * @param {string} baseUri - Server base URI.
 * @returns {string} Lower-case hostname with trailing dots removed.
 */
function _hostnameFromBaseUri(baseUri) {
  const hostname = new URL(baseUri).hostname.toLowerCase();
  return hostname.replace(/\.+$/, '');
}
