/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createHash, X509Certificate} from 'node:crypto';
import {config} from '@bedrock/core';
import {logger} from './logger.js';
import {logUtils} from './logger/events/index.js';

/**
 * @typedef {object} CertificateSummary
 * @property {string} subject - Subject distinguished name.
 * @property {string} issuer - Issuer distinguished name.
 * @property {string} serialNumber - Serial number, uppercase hex.
 * @property {string} sha256 - SHA-256 of the DER encoding, lowercase hex.
 */

/**
 * @typedef {object} IssuerCertificateDescription
 * @property {string|undefined} docType - The mdoc document type.
 * @property {number} chainLength - Number of certificates in `x5chain`.
 * @property {CertificateSummary|null} signer - The Document Signer (leaf).
 * @property {CertificateSummary|null} root - The `caStore` root that issued
 *   the last certificate in `x5chain`, or `null` when none did.
 */

const dn = name => name.split('\n').join(', ');

/**
 * @param {X509Certificate} cert - Certificate to summarize.
 * @returns {CertificateSummary} Log-safe summary.
 */
const summarize = cert => ({
  subject: dn(cert.subject),
  issuer: dn(cert.issuer),
  serialNumber: cert.serialNumber,
  sha256: createHash('sha256').update(cert.raw).digest('hex')
});

const parse = input => {
  try {
    return new X509Certificate(input);
  } catch {
    return null;
  }
};

/**
 * Describe the issuer certificates of each document in a verified mdoc, so a
 * log can record which signing pipeline produced the credential. Apple,
 * Google, and the CA DMV wallet may each be provisioned through a distinct
 * Document Signer or IACA root; this exposes the data needed to find out.
 *
 * Certificates are issuer-level, not holder-level, so the output holds no
 * personal data.
 *
 * @param {object} options - Options object.
 * @param {object} options.verifiedMdoc - MDoc returned by `@auth0/mdl`
 *   `Verifier.verify()`.
 * @param {Array<string>} options.trustedCertificates - PEM roots from
 *   `config.opencred.caStore`.
 * @returns {Array<IssuerCertificateDescription>} One entry per document.
 */
export function describeIssuerCertificates({
  verifiedMdoc, trustedCertificates
}) {
  const roots = (trustedCertificates ?? []).map(parse).filter(Boolean);
  const documents = Array.isArray(verifiedMdoc?.documents) ?
    verifiedMdoc.documents : [];
  return documents.map(doc => {
    const x5chain = doc.issuerSigned?.issuerAuth?.x5chain ?? [];
    // parse the leaf and the top of the chain by position; a certificate
    // that fails to parse must not shift another into its place
    const signer = x5chain.length > 0 ? parse(x5chain[0]) : null;
    const last = x5chain.length > 1 ? parse(x5chain.at(-1)) : signer;
    const root = last && roots.find(
      candidate => last.checkIssued(candidate) &&
        last.verify(candidate.publicKey));
    return {
      docType: doc.docType,
      chainLength: x5chain.length,
      signer: signer ? summarize(signer) : null,
      root: root ? summarize(root) : null
    };
  });
}

/**
 * Log `describeIssuerCertificates` output for a verified mdoc as a
 * `mdoc_issuer_certificates` presentation event when
 * `options.mdocIssuerCertificateLogging` is on. Never throws: a logging
 * failure must not fail a presentation that has already verified.
 *
 * @param {object} options - Options object.
 * @param {object} options.verifiedMdoc - MDoc returned by `@auth0/mdl`
 *   `Verifier.verify()`.
 * @param {Array<string>} options.trustedCertificates - PEM roots from
 *   `config.opencred.caStore`.
 * @param {object} [options.workflow] - The workflow being run.
 * @param {object} options.exchange - The exchange being completed.
 */
export function logIssuerCertificates({
  verifiedMdoc, trustedCertificates, workflow, exchange
}) {
  if(config.opencred?.options?.mdocIssuerCertificateLogging !== true) {
    return;
  }
  try {
    logUtils.mdocIssuerCertificates({
      clientId: workflow?.clientId,
      exchangeId: exchange?.id,
      profile: exchange?.variables?.profile,
      documents: describeIssuerCertificates({
        verifiedMdoc, trustedCertificates
      })
    });
  } catch(error) {
    try {
      logger.warning('Failed to log mdoc issuer certificates', {
        exchangeId: exchange?.id,
        error: error?.message
      });
    } catch {
      // the logger itself failed; nothing left to report to
    }
  }
}
