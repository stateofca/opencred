/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  buildReaderAuthenticationAll,
  signReaderAuthAll
} from '../../../lib/workflows/common/mdoc-reader-auth.js';
import {appleWalletTestEntry} from '../../fixtures/wallet-certificates.js';

import {cborEncode, DataItem} from '@auth0/mdl/lib/cbor/index.js';
import expect from 'expect.js';

import {importPKCS8, importSPKI} from 'jose';
import {decode as cborDecode} from 'cbor-x';
import {Sign1} from 'cose-kit';

const COSE_ALG = 1;
const COSE_HDR_X5CHAIN = 33;

async function loadTestKey() {
  return importPKCS8(appleWalletTestEntry.privateKeyPem, 'ES256');
}

function pemToDer(pem) {
  return new Uint8Array(Buffer.from(
    pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''),
    'base64'
  ));
}

describe('mdoc-reader-auth signer', () => {
  it('buildReaderAuthenticationAll yields the 4-element tuple', () => {
    const sessionTranscript = [
      null, null, ['dcapi', new Uint8Array(32)]
    ];
    const itemsRequestList = [
      {docType: 'org.iso.18013.5.1.mDL', nameSpaces: {
        'org.iso.18013.5.1': {family_name: true}
      }},
      {docType: 'org.iso.18013.5.1.mDL', nameSpaces: {
        'org.iso.18013.5.1': {given_name: false}
      }}
    ];
    const deviceRequestInfo = {
      useCases: [{mandatory: true, documentSets: [[0], [1]]}]
    };

    const t = buildReaderAuthenticationAll({
      sessionTranscript, itemsRequestList, deviceRequestInfo
    });
    expect(t).to.be.an(Array);
    expect(t.length).to.be(4);

    // Apple Wallet expectation not found in Annex C text
    expect(t[0]).to.be('ReaderAuthenticationAll');

    expect(t[1]).to.eql(sessionTranscript);
    expect(t[2]).to.be.an(Array);
    expect(t[2].length).to.be(2);
    expect(t[2][0]).to.be.a(DataItem);
    expect(t[2][1]).to.be.a(DataItem);
    expect(t[3]).to.be.a(DataItem);

    // round-trip CBOR encode → decode to confirm tag-24 wrapping
    const encoded = new Uint8Array(cborEncode(DataItem.fromData(t)));
    const decoded = cborDecode(encoded);
    // decoded is the inner tuple after the tag-24 unwrap (DataItem
    // .data round-trips back to the wire array; the @auth0/mdl
    // decoder unwraps tag-24 to bytes, but the outer DataItem.fromData
    // wrap is what we're verifying — assert leading bytes via a
    // separate buffer check below).
    expect(decoded).to.be.ok();

    // Leading bytes: outer wrap is tag-24 (0xD8 0x18) around a bstr.
    expect(encoded[0]).to.be(0xD8);
    expect(encoded[1]).to.be(0x18);
  });

  it('buildReaderAuthenticationAll uses CBOR null when ' +
   'deviceRequestInfo is omitted', () => {
    const sessionTranscript = [null, null, ['dcapi', new Uint8Array(32)]];
    const itemsRequestList = [
      {docType: 'org.iso.18013.5.1.mDL', nameSpaces: {
        'org.iso.18013.5.1': {family_name: true}
      }}
    ];

    const t1 = buildReaderAuthenticationAll({
      sessionTranscript, itemsRequestList, deviceRequestInfo: null
    });
    const t2 = buildReaderAuthenticationAll({
      sessionTranscript, itemsRequestList
      // deviceRequestInfo omitted
    });
    expect(t1[3]).to.be(null);
    expect(t2[3]).to.be(null);
  });

  it('signReaderAuthAll signs ReaderAuthenticationAllBytes; ' +
   'preserves order; verifies for every entry', async () => {
    const privateKey = await loadTestKey();
    const publicKey = await importSPKI(
      appleWalletTestEntry.publicKeyPem, 'ES256');
    const derChain = [pemToDer(appleWalletTestEntry.certificatePem)];
    const sessionTranscript = [
      null, null, ['dcapi', new Uint8Array(32)]
    ];
    const itemsRequestList = [
      {docType: 'org.iso.18013.5.1.mDL', nameSpaces: {
        'org.iso.18013.5.1': {family_name: true, given_name: false}
      }},
      {docType: 'org.iso.18013.5.1.mDL', nameSpaces: {
        'org.iso.18013.5.1': {document_number: true}
      }}
    ];
    const deviceRequestInfo = {
      useCases: [{mandatory: true, documentSets: [[0], [1]]}]
    };

    // Independently rebuild ReaderAuthenticationAllBytes from spec, so
    // a buggy buildReaderAuthenticationAll wouldn't make this test
    // pass.
    const expectedTuple = [
      'ReaderAuthenticationAll',
      sessionTranscript,
      itemsRequestList.map(ir => DataItem.fromData(ir)),
      DataItem.fromData(deviceRequestInfo)
    ];
    const expectedReaderAuthAllBytes = new Uint8Array(
      cborEncode(DataItem.fromData(expectedTuple))
    );

    const entries = [
      {privateKey, derChain},
      {privateKey, derChain}
    ];
    const all = await signReaderAuthAll({
      entries,
      sessionTranscript,
      itemsRequestList,
      deviceRequestInfo
    });
    expect(all.length).to.be(2);

    for(const s of all) {
      const dec = cborDecode(new Uint8Array(s.encode()));
      const restored = new Sign1(
        dec.protectedHeaders,
        dec.unprotectedHeaders,
        expectedReaderAuthAllBytes,
        dec.signature
      );
      expect(await restored.verify(publicKey)).to.be(true);
    }
  });

  it('signReaderAuthAll wire entries carry x5chain + ES256', async () => {
    const privateKey = await loadTestKey();
    const der = pemToDer(appleWalletTestEntry.certificatePem);
    const derChain = [der];
    const itemsRequestList = [{
      docType: 'org.iso.18013.5.1.mDL',
      nameSpaces: {'org.iso.18013.5.1': {family_name: true}}
    }];
    const deviceRequestInfo = {
      useCases: [{mandatory: true, documentSets: [[0]]}]
    };
    const sessionTranscript = [
      null, null, ['dcapi', new Uint8Array(32)]
    ];

    const [sign1] = await signReaderAuthAll({
      entries: [{privateKey, derChain}],
      sessionTranscript,
      itemsRequestList,
      deviceRequestInfo
    });

    expect(sign1.x5chain.length).to.be(1);
    expect(Buffer.from(sign1.x5chain[0])).to.eql(Buffer.from(der));
    expect(sign1.protectedHeaders.get(COSE_ALG)).to.be(-7);

    const wire = new Uint8Array(sign1.encode());
    const decoded = cborDecode(wire);
    expect(decoded instanceof Sign1).to.be(true);

    const parts = decoded.getContentForEncoding();
    expect(parts.length).to.be(4);

    const uh = parts[1];
    const x5raw = uh instanceof Map ?
      uh.get(COSE_HDR_X5CHAIN) :
      (uh[COSE_HDR_X5CHAIN] ?? uh[String(COSE_HDR_X5CHAIN)]);
    expect(x5raw).to.be.ok();
    expect(Buffer.from(new Uint8Array(x5raw))).to.eql(Buffer.from(der));

    // payload slot on the wire is empty (detached). The
    // device-request encoder will substitute CBOR null when emitting
    // readerAuthAll on the wire — that substitution is covered by
    // bedrock 261, not here.
    expect(Buffer.from(parts[2]).length).to.be(0);

    expect(Buffer.from(decoded.signature).length).to.be(64);
  });
});
