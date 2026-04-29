/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';
import {importPKCS8} from 'jose';

/**
 * Thrown when a vendor profile (for example, apple-wallet) requires
 * walletCertificates entries and none are configured. Maps to
 * HTTP 400 via `error.statusCode`.
 */
export class ReaderAuthConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReaderAuthConfigError';
    this.statusCode = 400;
    this.errorCode = 'READER_AUTH_CONFIG';
  }
}

/**
 * Return all walletCertificates entries matching `wallet`, in
 * config array order. Never throws; returns `[]` if unconfigured.
 *
 * @param {string} wallet - Identifier such as 'apple-wallet' or
 *   'google-wallet'.
 * @returns {Array<object>} Parsed entries.
 */
export function getWalletCertificatesByWallet(wallet) {
  const entries = config.opencred?.walletCertificates ?? [];
  return entries.filter(e => e.wallet === wallet);
}

/**
 * Parse a leaf-first concatenated PEM blob into DER byte arrays.
 *
 * @param {string} pem - Concatenated PEM.
 * @returns {Array<Uint8Array>} DER-encoded certs, in file order
 *   (leaf first).
 */
export function parseCertificateChainPem(pem) {
  const blocks = pem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g
  ) ?? [];
  return blocks.map(block => {
    const b64 = block
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s/g, '');
    return new Uint8Array(Buffer.from(b64, 'base64'));
  });
}

/**
 * Load a walletCertificates entry into a ready-to-sign shape.
 *
 * @param {object} entry - Parsed config entry.
 * @returns {Promise<object>} `{id, wallet, type, displayName,
 *   privateKey, derChain}`.
 */
export async function loadWalletCertEntry(entry) {
  const privateKey = await importPKCS8(entry.privateKeyPem, entry.type);
  const derChain = parseCertificateChainPem(entry.certificatePem);
  if(derChain.length === 0) {
    throw new Error(
      `walletCertificates[${entry.id}]: no PEM certificate blocks ` +
      `found in certificatePem`
    );
  }
  return {
    id: entry.id,
    wallet: entry.wallet,
    type: entry.type,
    displayName: entry.displayName,
    privateKey,
    derChain
  };
}
