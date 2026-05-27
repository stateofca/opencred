/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {cborEncode, DataItem} from '@auth0/mdl/lib/cbor/index.js';
import {Sign1} from 'cose-kit';

const READER_AUTH_ALG_ES256 = 'ES256';
const READER_AUTHENTICATION_ALL_CONTEXT = 'ReaderAuthenticationAll';

/**
 * Build the plain `ReaderAuthenticationAll` tuple expected by Apple
 * Wallet / `openwallet-foundation/multipaz` for top-level
 * `readerAuthAll` reader authentication. Not exactly what Annex C defines.
 *
 *   ["ReaderAuthenticationAll",
 *    SessionTranscript,
 *    [ItemsRequestBytes, ItemsRequestBytes, ...],
 *    DeviceRequestInfoBytes / null].
 *
 * The caller is responsible for tag-24-wrapping the returned tuple
 * (`DataItem.fromData(tuple)` + `cborEncode(...)` produces
 * `ReaderAuthenticationAllBytes` ready to pass to `Sign1.sign`).
 *
 * @param {object} options - Options object.
 * @param {Array} options.sessionTranscript - Plain SessionTranscript
 *   tuple, e.g. `[null, null, ['dcapi', sha256Bytes]]`.
 * @param {Array<object>} options.itemsRequestList - Plain
 *   ItemsRequest objects, one per docRequest, in the same order as
 *   `DeviceRequest.docRequests`.
 * @param {object | null} [options.deviceRequestInfo] - Plain
 *   DeviceRequestInfo object. Pass `null`/omit to emit CBOR `null` at
 *   index 3 (matches `multipaz` `deviceRequestInfo?.let ... ?:
 *   Simple.NULL`).
 * @returns {Array} 4-element tuple: ["ReaderAuthenticationAll",
 *   SessionTranscript, Array<DataItem>, DataItem | null].
 */
export function buildReaderAuthenticationAll({
  sessionTranscript,
  itemsRequestList,
  deviceRequestInfo
}) {
  const itemsRequestBytesList = itemsRequestList.map(
    ir => DataItem.fromData(ir)
  );
  const deviceRequestInfoElement = deviceRequestInfo == null ?
    null : DataItem.fromData(deviceRequestInfo);
  return [
    READER_AUTHENTICATION_ALL_CONTEXT,
    sessionTranscript,
    itemsRequestBytesList,
    deviceRequestInfoElement
  ];
}

/**
 * Produce one COSE_Sign1 `readerAuthAll[i]` per wallet-cert entry.
 *
 * Per `openwallet-foundation/multipaz` `DeviceRequest.kt`
 * `addReaderAuthAll` (the canonical Apple Wallet verifier path):
 *  - Protected header: {alg: ES256}.
 *  - Unprotected header: {x5chain: derChain}.
 *  - Payload slot on the wire is empty (detached; the device-request
 *    encoder substitutes CBOR `null` at index 2).
 *  - External AAD: empty bytestring.
 *  - Signed bytes: `ReaderAuthenticationAllBytes` =
 *    `#6.24(bstr .cbor [ "ReaderAuthenticationAll",
 *                        SessionTranscript,
 *                        [ItemsRequestBytes, ...],
 *                        DeviceRequestInfoBytes / null ])`.
 *
 * All entries sign the *same* `ReaderAuthenticationAllBytes`. The
 * returned `Sign1` instances are ready to be passed (as-is) to
 * `buildDeviceRequest` via the `readerAuthAll` option.
 *
 * @param {object} options - Options object.
 * @param {Array<object>} options.entries - Loaded wallet-cert
 *   entries (from `wallet-certificates.js#loadWalletCertEntry`).
 *   Each entry must have `privateKey` and `derChain`.
 * @param {Array} options.sessionTranscript - Plain SessionTranscript
 *   tuple (see `buildReaderAuthenticationAll`).
 * @param {Array<object>} options.itemsRequestList - Plain
 *   ItemsRequest objects, in `docRequests` order.
 * @param {object | null} [options.deviceRequestInfo] - Plain
 *   DeviceRequestInfo object; pass null to emit CBOR null.
 * @returns {Promise<Array<import('cose-kit').Sign1>>} One COSE_Sign1
 *   per entry, in input order. Each has an empty wire payload
 *   (detached) ready for `buildDeviceRequest` to flatten.
 */
export async function signReaderAuthAll({
  entries,
  sessionTranscript,
  itemsRequestList,
  deviceRequestInfo
}) {
  const readerAuthenticationAll = buildReaderAuthenticationAll({
    sessionTranscript,
    itemsRequestList,
    deviceRequestInfo
  });
  const readerAuthenticationAllBytes = new Uint8Array(
    cborEncode(DataItem.fromData(readerAuthenticationAll))
  );

  const results = [];
  for(const entry of entries) {
    const protectedHeaders = {alg: READER_AUTH_ALG_ES256};
    const unprotectedHeaders = {
      x5chain: Array.isArray(entry.derChain) && entry.derChain.length === 1 ?
        entry.derChain[0] : entry.derChain
    };
    const sign1 = await Sign1.sign(
      protectedHeaders,
      unprotectedHeaders,
      readerAuthenticationAllBytes,
      entry.privateKey
    );
    results.push(new Sign1(
      sign1.protectedHeaders,
      sign1.unprotectedHeaders,
      new Uint8Array(),
      sign1.signature
    ));
  }
  return results;
}
