/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as base64url from 'base64url-universal';
import {cborDecode, DataItem} from '@auth0/mdl/lib/cbor/index.js';

import {mapsToPlain} from './mapsToPlain.js';

const COSE_HDR_X5CHAIN = 33;

/**
 * Decode a base64url-encoded DeviceRequest into a structured plain
 * JS object suitable for expect.js assertions.
 *
 * @param {object} options - Options object.
 * @param {string} options.deviceRequest - Base64url(deviceRequest
 *   CBOR).
 * @returns {{
 *   raw: Map,
 *   plain: object,
 *   version: string,
 *   docRequests: Array<{
 *     docType: string,
 *     nameSpaces: object
 *   }>,
 *   deviceRequestInfo: object,
 *   readerAuthAll: Array<{
 *     shape: 'array4'|'array-other'|'map'|'unknown',
 *     elements: any
 *   }>,
 *   topLevelKeys: string[]
 * }} Decoded DeviceRequest views for tests and auditing.
 */
export function decodeDeviceRequestB64({deviceRequest}) {
  const bytes = base64url.decode(deviceRequest);
  const raw = cborDecode(bytes);
  if(!(raw instanceof Map)) {
    throw new TypeError('DeviceRequest CBOR must decode to a Map');
  }

  const plain = _normalizePlain(raw);
  const topLevelKeys = [...raw.keys()].map(k => String(k)).sort();
  const version = raw.get('version');

  const docRequestsRaw = raw.get('docRequests') ?? [];
  const docRequests = docRequestsRaw.map(dr => {
    const itemsRequest = _unwrapTag24(dr.get('itemsRequest'));
    const irPlain = mapsToPlain(itemsRequest);
    return {
      docType: irPlain.docType,
      nameSpaces: mapsToPlain(irPlain.nameSpaces ?? {})
    };
  });

  const deviceRequestInfo = mapsToPlain(
    _unwrapTag24(raw.get('deviceRequestInfo')) ?? {}
  );

  const readerAuthAllRaw = raw.get('readerAuthAll') ?? [];
  const readerAuthAll = readerAuthAllRaw.map(entry => {
    const classified = classifyReaderAuthEntry({entry});
    return {
      shape: classified.shape,
      elements: entry
    };
  });

  return {
    raw,
    plain,
    version,
    docRequests,
    deviceRequestInfo,
    readerAuthAll,
    topLevelKeys
  };
}

/**
 * Decode a base64url-encoded EncryptionInfo `["dcapi", {nonce,
 * recipientPublicKey}]` envelope.
 *
 * @param {object} options - Options object.
 * @param {string} options.encryptionInfo - Base64url(EncryptionInfo
 *   CBOR).
 * @returns {{
 *   tag: string,
 *   nonce: Uint8Array,
 *   recipientPublicKey: object,
 *   nonceLength: number
 * }} Decoded EncryptionInfo envelope fields.
 */
export function decodeEncryptionInfoB64({encryptionInfo}) {
  const bytes = base64url.decode(encryptionInfo);
  const decoded = cborDecode(bytes);
  if(!Array.isArray(decoded) || decoded.length !== 2) {
    throw new TypeError(
      'EncryptionInfo CBOR must be a 2-element array');
  }
  const [tag, paramsRaw] = decoded;
  const params = mapsToPlain(paramsRaw);
  if(!params || typeof params !== 'object') {
    throw new TypeError(
      'EncryptionInfo second element must be an object');
  }
  const nonce = params.nonce;
  if(!_isByteString(nonce)) {
    throw new TypeError('EncryptionInfo nonce must be a byte string');
  }
  return {
    tag,
    nonce: nonce instanceof Uint8Array ? nonce : new Uint8Array(nonce),
    recipientPublicKey: mapsToPlain(params.recipientPublicKey),
    nonceLength: nonce.length
  };
}

/**
 * Classify a single readerAuthAll entry by shape (for diagnostic
 * reporting). Pure function; does not throw on unknown shapes.
 *
 * @param {object} options - Options object.
 * @param {*} options.entry - One element from
 *   `decoded.get('readerAuthAll')`.
 * @returns {{
 *   shape: 'array4'|'array-other'|'map'|'unknown',
 *   protectedBstrLength?: number,
 *   unprotectedHeaderKeys?: Array<number|string>,
 *   payloadKind?: 'null'|'bstr-empty'|'bstr'|'other',
 *   signatureLength?: number
 * }} ReaderAuthAll entry shape classification.
 */
export function classifyReaderAuthEntry({entry}) {
  if(Array.isArray(entry)) {
    const shape = entry.length === 4 ? 'array4' : 'array-other';
    return {
      shape,
      protectedBstrLength: _byteLength(entry[0]),
      unprotectedHeaderKeys: _headerKeys(entry[1]),
      payloadKind: _payloadKind(entry[2]),
      signatureLength: _byteLength(entry[3])
    };
  }
  if(entry instanceof Map) {
    return _classifyMapEntry(entry);
  }
  if(entry && typeof entry === 'object') {
    if('encodedProtectedHeaders' in entry ||
       'unprotectedHeaders' in entry ||
       'signature' in entry ||
       'payload' in entry) {
      return {
        shape: 'map',
        protectedBstrLength: _byteLength(entry.encodedProtectedHeaders),
        unprotectedHeaderKeys: _headerKeys(entry.unprotectedHeaders),
        payloadKind: _payloadKind(entry.payload),
        signatureLength: _byteLength(entry.signature)
      };
    }
  }
  return {shape: 'unknown'};
}

/**
 * @param {*} value - CBOR-decoded value.
 * @returns {*} Unwrapped inner value for tag-24 fields.
 */
function _unwrapTag24(value) {
  if(value == null) {
    return value;
  }
  if(value instanceof DataItem) {
    return value.data;
  }
  if(value && typeof value === 'object' && 'value' in value) {
    const inner = value.value;
    if(inner instanceof Uint8Array) {
      return cborDecode(inner);
    }
    return inner;
  }
  if(value instanceof Uint8Array) {
    return cborDecode(value);
  }
  return value;
}

/**
 * @param {*} value - CBOR-decoded value.
 * @returns {*} Plain JSON-compatible structure with tag-24 unwrapped.
 */
function _normalizePlain(value) {
  if(value instanceof DataItem) {
    return _normalizePlain(value.data);
  }
  if(value instanceof Map) {
    const o = {};
    for(const [k, v] of value) {
      o[k] = _normalizePlain(v);
    }
    return o;
  }
  if(Array.isArray(value)) {
    return value.map(_normalizePlain);
  }
  return value;
}

/**
 * @param {Map} entry - Map-shaped readerAuthAll entry.
 * @returns {object} Classification result.
 */
function _classifyMapEntry(entry) {
  const get = key => entry.get(key);
  return {
    shape: 'map',
    protectedBstrLength: _byteLength(
      get('encodedProtectedHeaders') ?? get(0)),
    unprotectedHeaderKeys: _headerKeys(
      get('unprotectedHeaders') ?? get(1)),
    payloadKind: _payloadKind(get('payload') ?? get(2)),
    signatureLength: _byteLength(get('signature') ?? get(3))
  };
}

/**
 * @param {*} headers - COSE unprotected header map or object.
 * @returns {Array<number|string>} Sorted header keys.
 */
function _headerKeys(headers) {
  if(headers == null) {
    return [];
  }
  const keys = headers instanceof Map ?
    [...headers.keys()] :
    Object.keys(headers);
  return keys.map(k => {
    const n = Number(k);
    return Number.isInteger(n) && String(n) === String(k) ? n : k;
  }).sort((a, b) => String(a).localeCompare(String(b)));
}

/**
 * @param {*} payload - COSE payload slot value.
 * @returns {'null'|'bstr-empty'|'bstr'|'other'|undefined} Payload kind.
 */
function _payloadKind(payload) {
  if(payload === null) {
    return 'null';
  }
  if(payload instanceof Uint8Array) {
    return payload.length === 0 ? 'bstr-empty' : 'bstr';
  }
  return 'other';
}

/**
 * @param {*} value - Byte string candidate.
 * @returns {number|undefined} Byte length when applicable.
 */
function _byteLength(value) {
  if(_isByteString(value)) {
    return value.length;
  }
  return undefined;
}

/**
 * @param {*} value - Candidate byte string.
 * @returns {boolean} True for Uint8Array or Buffer values.
 */
function _isByteString(value) {
  return value instanceof Uint8Array || Buffer.isBuffer(value);
}

/**
 * Extract x5chain DER from a readerAuthAll entry, if present.
 *
 * @param {object} options - Options object.
 * @param {*} options.entry - ReaderAuthAll element.
 * @returns {Uint8Array|Uint8Array[]|null} X5chain DER or null.
 */
export function extractX5ChainFromEntry({entry}) {
  const classified = classifyReaderAuthEntry({entry});
  let unprotected;
  if(classified.shape === 'array4' || classified.shape === 'array-other') {
    unprotected = entry[1];
  } else if(classified.shape === 'map') {
    if(entry instanceof Map) {
      unprotected = entry.get('unprotectedHeaders');
    } else {
      unprotected = entry.unprotectedHeaders;
    }
  } else {
    return null;
  }
  return _getX5Chain(unprotected);
}

/**
 * @param {*} headers - Unprotected header map or object.
 * @returns {Uint8Array|Uint8Array[]|null} X5chain value.
 */
function _getX5Chain(headers) {
  if(headers == null) {
    return null;
  }
  const x5 = headers instanceof Map ?
    (headers.get(COSE_HDR_X5CHAIN) ?? headers.get('x5chain')) :
    (headers[COSE_HDR_X5CHAIN] ?? headers.x5chain ?? headers['33']);
  if(x5 instanceof Uint8Array) {
    return x5;
  }
  if(Array.isArray(x5) && x5.every(v => v instanceof Uint8Array)) {
    return x5;
  }
  return null;
}
