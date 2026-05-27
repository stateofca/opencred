/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

// Use MDL-packaged cborEncode so DataItem tag-24 extensions share one
// cbor-x instance with ESM (bare `cbor-x` import decodes tag-24 as empty).
import {cborEncode, DataItem} from '@auth0/mdl/lib/cbor/index.js';

/**
 * Thrown when a workflow query cannot produce a valid Annex C
 * DeviceRequest (for example, zero mdoc queries).
 */
export class BadMdocRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BadMdocRequestError';
    this.statusCode = 400;
    this.errorCode = 'BAD_MDOC_REQUEST';
  }
}

/**
 * Build an ISO/IEC 18013-5 + 18013-7 Annex C DeviceRequest CBOR.
 *
 * Structural rules applied:
 * - Each ItemsRequest is wrapped as #6.24(bstr .cbor ItemsRequest)
 *   via @auth0/mdl DataItem (the cbor-x extension on DataItem
 *   emits the tag-24 + bstr wrap on encode).
 * - Each nameSpaces[ns] value is a map
 *   { <fieldName>: <intent_to_retain: bool> }, never an array.
 * - The deviceRequestInfo field always carries a single mandatory
 *   UseCase whose `documentSets` enumerate per-doc alternatives:
 *   `useCases: [{mandatory: true, documentSets: [[0], [1], …, [N-1]]}]`.
 *
 * @param {object} options - Options object.
 * @param {object} options.dcqlQuery - DCQL query built for mdoc
 *   (each credentials[i].format === 'mso_mdoc').
 * @param {Array<object|Array>} [options.readerAuthAll] - Optional
 *   array of COSE_Sign1 values to embed as top-level `readerAuthAll`.
 *   Each entry may be a `cose-kit` `Sign1` instance or a 4-element
 *   array `[encodedProtectedHeaders, unprotectedHeaders, payload,
 *   signature]`. The detached-payload slot is always emitted as CBOR
 *   `null` per ISO/IEC 18013-7 Annex C / RFC 9052 §4.2.
 * @returns {Uint8Array} CBOR-encoded DeviceRequest.
 * @throws {BadMdocRequestError} When the query yields zero
 *   docRequests.
 */
export function buildDeviceRequest({dcqlQuery, readerAuthAll} = {}) {
  const itemsRequestList = buildItemsRequest({dcqlQuery});
  if(itemsRequestList.length === 0) {
    throw new BadMdocRequestError(
      'No mdoc query items found for Annex C DeviceRequest'
    );
  }

  const docRequests = itemsRequestList.map(itemsRequest => ({
    itemsRequest: DataItem.fromData(itemsRequest)
  }));

  const deviceRequestInfo = DataItem.fromData(
    buildDeviceRequestInfo({docRequestCount: itemsRequestList.length})
  );

  const deviceRequest = {
    version: '1.1',
    docRequests,
    deviceRequestInfo
  };
  if(readerAuthAll && readerAuthAll.length > 0) {
    deviceRequest.readerAuthAll = readerAuthAll.map(_toCoseSign1Array);
  }

  return new Uint8Array(cborEncode(deviceRequest));
}

/**
 * Build the ordered list of plain ItemsRequest objects from a DCQL
 * query. Callers that need ItemsRequestBytes (for example, for
 * ReaderAuthentication) should pass the result to
 * `buildItemsRequestBytesList`.
 *
 * @param {object} options - Options object.
 * @param {object} options.dcqlQuery - DCQL query; only
 *   `credentials[i]` entries with `format === 'mso_mdoc'` are used.
 * @returns {Array<object>} Array of ItemsRequest objects, one per
 *   mdoc credential query.
 */
export function buildItemsRequest({dcqlQuery} = {}) {
  const creds = (dcqlQuery?.credentials ?? []).filter(
    c => c.format === 'mso_mdoc'
  );
  return creds.map(cred => {
    const docType = cred?.meta?.doctype_value ?? 'org.iso.18013.5.1.mDL';
    const nameSpaces = {};
    for(const claim of cred?.claims ?? []) {
      const path = claim.path;
      if(!Array.isArray(path) || path.length < 2) {
        continue;
      }
      const [ns, field] = path;
      if(!nameSpaces[ns]) {
        nameSpaces[ns] = {};
      }
      nameSpaces[ns][field] = claim.intent_to_retain === true;
    }
    return {docType, nameSpaces};
  });
}

/**
 * Produce tag-24/bstr-wrapped ItemsRequestBytes for each
 * ItemsRequest, suitable for inclusion in
 * `ReaderAuthentication[2]`.
 *
 * @param {object} options - Options object.
 * @param {Array<object>} options.itemsRequestList - As returned by
 *   `buildItemsRequest`.
 * @returns {Array<Uint8Array>} One ItemsRequestBytes buffer per
 *   input entry.
 */
export function buildItemsRequestBytesList({itemsRequestList} = {}) {
  return itemsRequestList.map(
    ir => new Uint8Array(cborEncode(DataItem.fromData(ir)))
  );
}

/**
 * Build the plain `deviceRequestInfo` object for Annex C. Wrapped as
 * tag-24/bstr by the caller via DataItem.
 *
 * Returns a single mandatory UseCase with `documentSets` nested
 * inside, matching the on-the-wire shape Apple Wallet (and the
 * spruceid Rust reference) produces. Per OpenCred's "any one of
 * these credentials" semantic, `documentSets` is a list of singleton
 * arrays `[[0], [1], …, [N-1]]`, not `[[0, 1, …, N-1]]`.
 *
 * @param {object} options - Options object.
 * @param {number} options.docRequestCount - Number of docRequests
 *   the DeviceRequest will carry.
 * @returns {{useCases: Array<{
 *   mandatory: boolean,
 *   documentSets: Array<Array<number>>
 * }>}} Plain DeviceRequestInfo.
 */
export function buildDeviceRequestInfo({docRequestCount} = {}) {
  if(!Number.isInteger(docRequestCount) || docRequestCount < 1) {
    throw new BadMdocRequestError(
      'docRequestCount must be a positive integer'
    );
  }
  const documentSets = Array.from(
    {length: docRequestCount}, (_, i) => [i]
  );
  return {
    useCases: [{mandatory: true, documentSets}]
  };
}

/**
 * Normalize a COSE_Sign1 value to the CBOR wire shape:
 * `[encodedProtectedHeaders, unprotectedHeaders, payload, signature]`.
 * Always emits CBOR `null` at index 2 (detached payload per
 * ISO/IEC 18013-7 Annex C readerAuth). Quirks mode for Apple Wallet.
 *
 * Accepts either a `cose-kit` `Sign1` instance or a pre-flattened
 * 4-element array. Other shapes throw.
 *
 * @private
 * @param {object|Array} sig - `Sign1` instance OR 4-element array.
 * @returns {Array} 4-element array suitable for CBOR encoding.
 * @throws {TypeError} On unrecognized input shape.
 */
function _toCoseSign1Array(sig) {
  if(Array.isArray(sig)) {
    if(sig.length !== 4) {
      throw new TypeError(
        'readerAuthAll entry: array must have exactly 4 elements');
    }
    return [sig[0], sig[1], null, sig[3]];
  }
  if(sig && typeof sig === 'object' &&
     sig.encodedProtectedHeaders !== undefined &&
     sig.unprotectedHeaders !== undefined &&
     sig.signature !== undefined) {
    return [
      sig.encodedProtectedHeaders,
      sig.unprotectedHeaders,
      null,
      sig.signature
    ];
  }
  throw new TypeError(
    'readerAuthAll entry: expected cose-kit Sign1 or 4-element array');
}
