/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {
  cborDecode,
  cborEncode,
  DataItem
} from '@auth0/mdl/lib/cbor/index.js';
import {
  decode as cborDecodeBare,
  encode as cborEncodePlain
} from 'cbor-x';
import {appleWalletTestEntry} from '../fixtures/wallet-certificates.js';
import {baseUrl} from '../mock-data.js';
import {config} from '@bedrock/core';
import {createExchangeWithAuthRequest} from '../utils/exchanges.js';
import crypto from 'node:crypto';
import {database} from '../../lib/database.js';
import {exampleKey2} from '../fixtures/signingKeys.js';
import expect from 'expect.js';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';
import {importSPKI} from 'jose';
import {Sign1} from 'cose-kit';

// The x5chain header parameter (Label 33) in COSE is defined as an ordered
// chain of X.509 certificates used to identify the sender or recipient.  It is
// represented as a COSE_X509 value type, which allows for a single certificate
// (as a CBOR byte string) or multiple certificates (as a CBOR array of byte
// strings).
const COSE_HDR_X5CHAIN = 33;

/**
 * Normalize decoded headers to `Map` for `cose-kit` APIs.
 *
 * @param {Map|object|Uint8Array} hdr - Headers from CBOR.
 * @returns {Map<number, *>} Integer-keyed header map.
 */
function ensureCoseHeaderMap(hdr) {
  if(hdr instanceof Map) {
    if(hdr.has('x5chain') && !hdr.has(COSE_HDR_X5CHAIN)) {
      const copy = new Map(hdr);
      copy.set(COSE_HDR_X5CHAIN, hdr.get('x5chain'));
      return copy;
    }
    return hdr;
  }
  if(hdr instanceof Uint8Array || Buffer.isBuffer(hdr)) {
    return ensureCoseHeaderMap(cborDecodeBare(new Uint8Array(hdr)));
  }
  if(hdr && typeof hdr === 'object') {
    return new Map(Object.entries(hdr).map(([k, v]) => {
      const n = Number(k);
      const key = (
        k === 'x5chain' ||
        k === String(COSE_HDR_X5CHAIN)
      ) ? COSE_HDR_X5CHAIN :
        Number.isFinite(n) ? n : k;
      return [key, v];
    }));
  }
  throw new Error('Invalid COSE header map');
}

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

// Same native mdoc workflow shape as `250-18013-7-annex-c.test.js`.
const mdocTestRP = {
  type: 'native',
  clientId: 'mdoc-test',
  query: [{
    format: ['mso_mdoc'],
    fields: {
      'org.iso.18013.5.1': ['given_name', 'family_name']
    }
  }],
  clientSecret: 'shhh',
  oidc: {
    redirectUri: 'https://example.com'
  }
};

function pemToDer(pem) {
  return new Uint8Array(Buffer.from(
    pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''),
    'base64'
  ));
}

/**
 * Normalize `readerAuthAll[i]` from a decoded ISO DeviceRequest to `Sign1`.
 *
 * @param {*} entry - Nested CBOR value from `readerAuthAll`.
 * @returns {import('cose-kit').Sign1} Typed COSE_Sign1 instance.
 */
function decodeReaderAuthSign1(entry) {
  if(entry instanceof Sign1) {
    return entry;
  }

  let rawEntry = entry;
  while(rawEntry && typeof rawEntry === 'object' &&
    rawEntry.value !== undefined &&
    !(rawEntry instanceof Uint8Array) &&
    !Buffer.isBuffer(rawEntry) &&
    !(rawEntry instanceof Sign1)) {
    rawEntry = rawEntry.value;
  }

  const payload = rawEntry instanceof Uint8Array || Buffer.isBuffer(rawEntry) ?
    new Uint8Array(rawEntry) :
    new Uint8Array(cborEncode(rawEntry));

  const decoded = cborDecodeBare(payload);

  if(decoded instanceof Sign1) {
    return decoded;
  }

  // `cbor-x` may decode embedded COSE_Sign1 as an object (matching
  // `cose-kit` encoding), not a four-tuple; `Object.values` order is
  // wrong for that shape.
  if(decoded && typeof decoded === 'object' &&
    decoded.encodedProtectedHeaders !== undefined &&
    decoded.signature !== undefined &&
    decoded.unprotectedHeaders !== undefined) {
    const protectedHeaders = cborDecodeBare(
      new Uint8Array(decoded.encodedProtectedHeaders));
    const pay = decoded.payload instanceof Uint8Array ?
      decoded.payload :
      new Uint8Array(decoded.payload ?? []);
    const sig = decoded.signature instanceof Uint8Array ?
      decoded.signature :
      new Uint8Array(decoded.signature);
    return new Sign1(
      protectedHeaders,
      decoded.unprotectedHeaders,
      pay,
      sig
    );
  }

  let tuple;
  if(Array.isArray(decoded) && decoded.length === 4) {
    tuple = decoded;
  } else if(decoded instanceof Map) {
    tuple = [0, 1, 2, 3].map(i => decoded.get(i));
  } else if(decoded && typeof decoded === 'object') {
    tuple = [0, 1, 2, 3].map(i =>
      decoded[i] ?? decoded[String(i)]);
    if(tuple.some(v => v === undefined)) {
      tuple = null;
    }
  }

  if(tuple) {
    const [protectedRaw, unprotectedHeaders, payloadBytes, signature] =
      tuple;
    const protectedHeaders = protectedRaw instanceof Uint8Array ||
      Buffer.isBuffer(protectedRaw) ?
      cborDecodeBare(new Uint8Array(protectedRaw)) :
      protectedRaw;

    const pay = payloadBytes instanceof Uint8Array ? payloadBytes :
      new Uint8Array(payloadBytes ?? []);
    const sig = signature instanceof Uint8Array ? signature :
      new Uint8Array(signature);

    return new Sign1(
      protectedHeaders,
      unprotectedHeaders,
      pay,
      sig
    );
  }

  throw new Error(
    `Unsupported readerAuth (${typeof decoded}, ${decoded?.constructor?.name})`
  );
}

/**
 * Rebuild ReaderAuthenticationAllBytes the way Apple Wallet would
 * reconstruct it for verifying `readerAuthAll[i]`.
 *
 * @param {object} options - Inputs taken from the wire DeviceRequest.
 * @param {string} options.base64EncryptionInfo - DC API encryption info.
 * @param {string} options.serializedOrigin - Server origin string.
 * @param {Array} options.itemsReqDataItems - Tag-24 ItemsRequest
 *   `DataItem` values in `docRequests` order.
 * @param {*} options.deviceRequestInfoDataItem - Tag-24
 *   DeviceRequestInfo `DataItem`, or `null` if the wire request
 *   omitted it.
 * @returns {Uint8Array} ReaderAuthenticationAllBytes (tag-24 wrapped
 *   4-element tuple).
 */
function buildReaderAuthenticationAllBytesFromWire({
  base64EncryptionInfo,
  serializedOrigin,
  itemsReqDataItems,
  deviceRequestInfoDataItem
}) {
  const dcapiInfoForTranscript = [base64EncryptionInfo, serializedOrigin];
  const dcapiInfoBytesForTranscript = cborEncodePlain(dcapiInfoForTranscript);
  const sessionTranscriptHash = crypto.createHash('sha256');
  sessionTranscriptHash.update(dcapiInfoBytesForTranscript);
  const dcapiInfoHashForReaderAuth = new Uint8Array(
    sessionTranscriptHash.digest());
  const sessionTranscript = [
    null, null, ['dcapi', dcapiInfoHashForReaderAuth]];

  const readerAuthenticationAll = [
    'ReaderAuthenticationAll',
    sessionTranscript,
    itemsReqDataItems,
    deviceRequestInfoDataItem ?? null
  ];
  return new Uint8Array(
    cborEncode(DataItem.fromData(readerAuthenticationAll))
  );
}

describe('profile=apple-wallet end-to-end', function() {
  let rpStub;
  let baseUriStub;
  let signingKeysStub;

  beforeEach(function() {
    rpStub = sinon.stub(config.opencred, 'workflows').value([mdocTestRP]);
    baseUriStub = sinon.stub(config.server, 'baseUri').value(
      'https://example.com'
    );
    signingKeysStub = sinon.stub(config.opencred, 'signingKeys').value(
      [{...exampleKey2, purpose: ['authorization_request']}]
    );
  });

  afterEach(function() {
    rpStub.restore();
    baseUriStub.restore();
    signingKeysStub.restore();
  });

  describe('with configured walletCertificates', function() {
    let walletCertStub;

    beforeEach(function() {
      walletCertStub = sinon.stub(config.opencred, 'walletCertificates').value(
        [appleWalletTestEntry]
      );
    });

    afterEach(function() {
      walletCertStub.restore();
    });

    it('returns 200 with a signed Annex C envelope', async function() {
      const exchange = await createExchangeWithAuthRequest({
        workflow: mdocTestRP});
      const findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves({...exchange, workflowId: mdocTestRP.clientId});
      const replaceOneStub = sinon.stub(
        database.collections.Exchanges, 'replaceOne'
      ).resolves();

      const searchParams = new URLSearchParams();
      searchParams.set('profile', 'apple-wallet');

      let result;
      let err;
      try {
        result = await client.post(
          `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/request`,
          {
            body: searchParams,
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
              accept: 'application/json'
            }
          });
      } catch(e) {
        err = e;
      }

      findOneStub.restore();
      replaceOneStub.restore();

      expect(err).to.be(undefined);
      expect(result.status).to.equal(200);
      expect(result.data.dcApiRequest).to.be.an('object');

      const {dcApiRequest} = result.data;
      const requestBytes = Buffer.from(
        dcApiRequest.data.deviceRequest,
        'base64url'
      );
      const decodedDr = cborDecode(new Uint8Array(requestBytes));

      const readerAuthAll = decodedDr.get('readerAuthAll');
      expect(readerAuthAll).to.be.an('array');
      expect(readerAuthAll.length).to.be(1);

      const sign1 = decodeReaderAuthSign1(readerAuthAll[0]);
      // ES256 (-7) `alg` is implicit when `verify()` succeeds with ES256 SPKI.

      const derFixture = pemToDer(appleWalletTestEntry.certificatePem);
      const uhMap = ensureCoseHeaderMap(sign1.unprotectedHeaders);
      const x5raw = uhMap.get(COSE_HDR_X5CHAIN);

      expect(x5raw).to.be.ok();
      expect(Buffer.from(new Uint8Array(x5raw))).to.eql(
        Buffer.from(derFixture));

      const docRequests = decodedDr.get('docRequests');
      const itemsReqDataItems = docRequests.map(dr => dr.get('itemsRequest'));
      const deviceRequestInfoDataItem =
        decodedDr.get('deviceRequestInfo') ?? null;

      const readerAuthenticationAllBytes =
        buildReaderAuthenticationAllBytesFromWire({
          base64EncryptionInfo: dcApiRequest.data.encryptionInfo,
          serializedOrigin: 'https://example.com',
          itemsReqDataItems,
          deviceRequestInfoDataItem
        });

      const publicKey = await importSPKI(
        appleWalletTestEntry.publicKeyPem, 'ES256');
      const forVerify = new Sign1(
        ensureCoseHeaderMap(sign1.protectedHeaders),
        ensureCoseHeaderMap(sign1.unprotectedHeaders),
        readerAuthenticationAllBytes,
        sign1.signature
      );
      expect(await forVerify.verify(publicKey)).to.be(true);
    });
  });

  describe('without configured walletCertificates', function() {
    let walletCertStub;

    beforeEach(function() {
      walletCertStub = sinon.stub(config.opencred, 'walletCertificates').value(
        []
      );
    });

    afterEach(function() {
      walletCertStub.restore();
    });

    it('returns 400 READER_AUTH_CONFIG for apple-wallet', async function() {
      const exchange = await createExchangeWithAuthRequest({
        workflow: mdocTestRP});
      const findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
        .resolves({...exchange, workflowId: mdocTestRP.clientId});

      const searchParams = new URLSearchParams();
      searchParams.set('profile', 'apple-wallet');

      let err;
      try {
        await client.post(
          `${baseUrl}/workflows/${mdocTestRP.clientId}/exchanges/` +
          `${exchange.id}/openid/client/authorization/request`,
          {
            body: searchParams,
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
              accept: 'application/json'
            }
          });
      } catch(e) {
        err = e;
      }

      findOneStub.restore();

      expect(err).to.not.be(undefined);
      expect(err.status).to.equal(400);
      expect(err.data.error).to.equal('READER_AUTH_CONFIG');
    });
  });
});
