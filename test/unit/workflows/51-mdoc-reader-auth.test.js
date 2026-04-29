/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  buildReaderAuthentication,
  signReaderAuth,
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
  it('buildReaderAuthentication yields ReaderAuthentication tuple', () => {
    const sessionTranscript = [
      null, null, ['OpenID4VPDCAPIHandover', new Uint8Array(32)]
    ];
    const itemsRequestBytes = new Uint8Array([0xa0]);
    const t = buildReaderAuthentication({sessionTranscript, itemsRequestBytes});
    expect(t).to.be.an(Array);
    expect(t.length).to.be(3);
    expect(t[0]).to.be('ReaderAuthentication');
    expect(t[1]).to.eql(sessionTranscript);
    expect(t[2]).to.be.a(Uint8Array);
    expect(t[2][0]).to.be(0xa0);
  });

  it('produces COSE_Sign1 with x5chain; verifies with payload', async () => {
    const privateKey = await loadTestKey();
    const publicKey = await importSPKI(
      appleWalletTestEntry.publicKeyPem, 'ES256');
    const der = pemToDer(appleWalletTestEntry.certificatePem);
    const derChain = [der];
    const sessionTranscript = [
      null, null, ['OpenID4VPDCAPIHandover', new Uint8Array(32)]
    ];
    const itemsRequestBytes = new Uint8Array([0xa0]);

    const readerAuthentication = buildReaderAuthentication({
      sessionTranscript,
      itemsRequestBytes
    });
    const readerAuthenticationBytes = new Uint8Array(
      cborEncode(DataItem.fromData(readerAuthentication))
    );

    const sign1 = await signReaderAuth({
      privateKey,
      derChain,
      sessionTranscript,
      itemsRequestBytes
    });

    expect(sign1.x5chain.length).to.be(1);
    expect(Buffer.from(sign1.x5chain[0])).to.eql(Buffer.from(der));
    expect(sign1.protectedHeaders.get(COSE_ALG)).to.be(-7);

    const encoded = sign1.encode();
    const wire = new Uint8Array(encoded);
    const decoded = cborDecode(wire);
    expect(decoded instanceof Sign1).to.be(true);
    expect(decoded.constructor.name).to.be('Sign1');

    const parts = decoded.getContentForEncoding();
    expect(parts.length).to.be(4);

    expect(decoded.protectedHeaders.get(COSE_ALG)).to.be(-7);

    const uh = parts[1];
    const x5raw = uh instanceof Map ?
      uh.get(COSE_HDR_X5CHAIN) :
      (uh[COSE_HDR_X5CHAIN] ?? uh[String(COSE_HDR_X5CHAIN)]);
    expect(x5raw).to.be.ok();
    expect(Buffer.from(new Uint8Array(x5raw))).to.eql(Buffer.from(der));

    const payloadSlot = parts[2];
    expect(Buffer.from(payloadSlot).length).to.be(0);

    expect(Buffer.from(decoded.signature).length).to.be(64);

    const forVerify = new Sign1(
      decoded.protectedHeaders,
      decoded.unprotectedHeaders,
      readerAuthenticationBytes,
      decoded.signature
    );
    expect(await forVerify.verify(publicKey)).to.be(true);
  });

  it('signReaderAuthAll preserves order and count', async () => {
    const privateKey = await loadTestKey();
    const publicKey = await importSPKI(
      appleWalletTestEntry.publicKeyPem, 'ES256');
    const derChain = [pemToDer(appleWalletTestEntry.certificatePem)];
    const sessionTranscript = [
      null, null, ['OpenID4VPDCAPIHandover', new Uint8Array(32)]
    ];
    const itemsRequestBytes = new Uint8Array([0xa0]);

    const readerAuthentication = buildReaderAuthentication({
      sessionTranscript,
      itemsRequestBytes
    });
    const readerAuthenticationBytes = new Uint8Array(
      cborEncode(DataItem.fromData(readerAuthentication))
    );

    const entries = [
      {privateKey, derChain},
      {privateKey, derChain}
    ];
    const all = await signReaderAuthAll({
      entries,
      sessionTranscript,
      itemsRequestBytes
    });
    expect(all.length).to.be(2);

    for(const s of all) {
      const dec = cborDecode(new Uint8Array(s.encode()));
      const restored = new Sign1(
        dec.protectedHeaders,
        dec.unprotectedHeaders,
        readerAuthenticationBytes,
        dec.signature
      );
      expect(await restored.verify(publicKey)).to.be(true);
    }
  });
});
