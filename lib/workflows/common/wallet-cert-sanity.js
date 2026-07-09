/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as asn1js from 'asn1js';
import {createHash} from 'node:crypto';
import {parseCertificateChainPem} from './wallet-certificates.js';
import {X509Certificate} from '@peculiar/x509';

const EXPIRY_WARN_DAYS = 30;
const EXPIRY_WARN_MS = EXPIRY_WARN_DAYS * 24 * 60 * 60 * 1000;

// Google Wallet Verifier Registrar binding extension: non-critical,
// content is an ASN.1 OCTET STRING of SHA-256(RelyingPartyMetadataBytes).
const GW_RP_METADATA_OID = '1.3.6.1.4.1.11129.10.1';

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

    if(entry.wallet === 'google-wallet' &&
      entry.google?.rpMetadataBytes) {
      const bindingWarnings = _checkGoogleMetadataBinding({
        cert,
        rpMetadataBytes: entry.google.rpMetadataBytes
      });
      summary.warnings.push(...bindingWarnings);
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

/**
 * Check that `rpMetadataBytes` matches the leaf cert's Google binding
 * extension (1.3.6.1.4.1.11129.10.1). Warn-only: returns human-readable
 * warning strings; never throws.
 *
 * @param {object} options - Options object.
 * @param {X509Certificate} options.cert - Parsed leaf certificate.
 * @param {string} options.rpMetadataBytes - Base64URL RP metadata.
 * @returns {string[]} Zero or more warning strings.
 */
function _checkGoogleMetadataBinding({cert, rpMetadataBytes}) {
  let expected;
  try {
    expected = createHash('sha256')
      .update(Buffer.from(rpMetadataBytes, 'base64url'))
      .digest();
  } catch(err) {
    return [
      `unable to hash google.rpMetadataBytes: ${err.message}`
    ];
  }

  let ext;
  try {
    ext = cert.getExtension(GW_RP_METADATA_OID);
  } catch(err) {
    return [
      `unable to read leaf extension ${GW_RP_METADATA_OID}: ${err.message}`
    ];
  }
  if(!ext) {
    return [
      `cannot verify google.rpMetadataBytes: leaf cert has no ` +
      `${GW_RP_METADATA_OID} binding extension`
    ];
  }

  const actual = _extractOctetString(ext.value);
  if(actual === null) {
    return [
      `leaf extension ${GW_RP_METADATA_OID} is present but its value ` +
      `could not be parsed as a SHA-256 OCTET STRING`
    ];
  }
  if(!expected.equals(actual)) {
    return [
      `google.rpMetadataBytes does not match the leaf cert binding ` +
      `extension ${GW_RP_METADATA_OID} (SHA-256 mismatch)`
    ];
  }
  return [];
}

/**
 * Extract a 32-byte digest from an extension value. Accepts a DER
 * OCTET STRING wrapper (04 20 <hash>) or a raw 32-byte buffer.
 *
 * @param {ArrayBuffer} value - Extension value bytes.
 * @returns {Buffer|null} 32-byte digest, or null when not extractable.
 */
function _extractOctetString(value) {
  const raw = Buffer.from(value);
  try {
    const parsed = asn1js.fromBER(value);
    const block = parsed?.result;
    if(block && block.constructor?.name === 'OctetString') {
      const inner = Buffer.from(block.valueBlock.valueHexView);
      if(inner.length === 32) {
        return inner;
      }
    }
  } catch {
    // fall through to raw handling below
  }
  return raw.length === 32 ? raw : null;
}
