/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {cborEncode, DataItem} from '@auth0/mdl/lib/cbor/index.js';
import {Sign1} from 'cose-kit';

const READER_AUTH_ALG_ES256 = 'ES256';

/**
 * Build the plain ReaderAuthentication tuple per ISO/IEC 18013-5
 * §9.1.4: ["ReaderAuthentication", SessionTranscript,
 * ItemsRequestBytes].
 *
 * `sessionTranscript` here is the *plain* SessionTranscript value
 * (a 3-element array `[null, null, Handover]`), not the tag-24
 * wrap. The outer tag-24 wrap for `ReaderAuthenticationBytes` is
 * handled by `signReaderAuth` via `DataItem.fromData` and mdl
 * `cborEncode`.
 *
 * @param {object} options - Options object.
 * @param {Array} options.sessionTranscript - The plain SessionTranscript
 *   tuple as `[null, null, Handover]`.
 * @param {Uint8Array} options.itemsRequestBytes - Tag-24 wrapped
 *   ItemsRequestBytes (per docRequest; often docRequest[0]).
 * @returns {Array} The tuple ready for tag-24 wrapping.
 */
export function buildReaderAuthentication({
  sessionTranscript,
  itemsRequestBytes
}) {
  return [
    'ReaderAuthentication',
    sessionTranscript,
    itemsRequestBytes
  ];
}

/**
 * Produce a COSE_Sign1 ReaderAuth for one wallet-certificate entry.
 *
 * Follows ISO/IEC 18013-5 §9.1.4 structure.
 *  - Protected header: {alg: ES256}.
 *  - Unprotected header: {x5chain: derChain}.
 *  - Payload slot on the wire is empty (detached).
 *  - External AAD: empty bytestring.
 *  - Signed bytes: ReaderAuthenticationBytes as tag-24 wrapped CBOR.
 *
 * The returned `Sign1` has an empty payload slot and can be CBOR-encoded
 * directly for embedding in DeviceRequest.readerAuthAll[i].
 * Verification must supply the original `ReaderAuthenticationBytes` as
 * the payload argument to `Sign1#verify` (see cose-kit).
 *
 * @param {object} options - Options.
 * @param {import('jose').KeyLike | Uint8Array} options.privateKey - ES256
 *   private key (jose KeyLike or raw). Must match the leaf certificate in
 *   `derChain`.
 * @param {Uint8Array | Uint8Array[]} options.derChain - DER cert
 *   chain, leaf first (matches RFC 9360 x5chain).
 * @param {Array} options.sessionTranscript - Plain SessionTranscript
 *   tuple (see buildReaderAuthentication).
 * @param {Uint8Array} options.itemsRequestBytes - ItemsRequestBytes
 *   for the docRequest this signature covers.
 * @returns {Promise<import('cose-kit').Sign1>} Signed COSE_Sign1 for
 *   DeviceRequest.readerAuthAll.
 */
export async function signReaderAuth({
  privateKey,
  derChain,
  sessionTranscript,
  itemsRequestBytes
}) {
  const readerAuthentication = buildReaderAuthentication({
    sessionTranscript,
    itemsRequestBytes
  });
  const readerAuthenticationBytes = new Uint8Array(
    cborEncode(DataItem.fromData(readerAuthentication))
  );

  const protectedHeaders = {alg: READER_AUTH_ALG_ES256};
  const unprotectedHeaders = {
    x5chain: Array.isArray(derChain) && derChain.length === 1 ?
      derChain[0] : derChain
  };

  const sign1 = await Sign1.sign(
    protectedHeaders,
    unprotectedHeaders,
    readerAuthenticationBytes,
    privateKey
  );

  return new Sign1(
    sign1.protectedHeaders,
    sign1.unprotectedHeaders,
    new Uint8Array(),
    sign1.signature
  );
}

/**
 * Sign ReaderAuth for every provided entry in input order (config
 * order). Intended for use by the Annex C handler to produce
 * `readerAuthAll`.
 *
 * @param {object} options - Options.
 * @param {Array} options.entries - Loaded wallet-cert entries as
 *   returned by `wallet-certificates.js#loadWalletCertEntry`.
 *   Each entry must have `privateKey` (KeyLike) and `derChain`.
 * @param {Array} options.sessionTranscript - SessionTranscript
 *   tuple.
 * @param {Uint8Array} options.itemsRequestBytes - ItemsRequestBytes
 *   for the docRequest this signature covers.
 * @returns {Promise<Array<import('cose-kit').Sign1>>} One COSE_Sign1
 *   per entry, in input order.
 */
export async function signReaderAuthAll({
  entries,
  sessionTranscript,
  itemsRequestBytes
}) {
  const results = [];
  for(const entry of entries) {
    const sig = await signReaderAuth({
      privateKey: entry.privateKey,
      derChain: entry.derChain,
      sessionTranscript,
      itemsRequestBytes
    });
    results.push(sig);
  }
  return results;
}
