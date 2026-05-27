/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {appleWalletTestEntry} from '../fixtures/wallet-certificates.js';
import {baseUrl} from '../mock-data.js';
import {cborDecode} from '@auth0/mdl/lib/cbor/index.js';
import {config} from '@bedrock/core';
import {createExchangeWithAuthRequest} from '../utils/exchanges.js';
import {database} from '../../lib/database.js';
import {exampleKey2} from '../fixtures/signingKeys.js';
import expect from 'expect.js';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

// Minimal mdoc workflow; mirrors 260's `mdocTestRP` shape.
const mdocTestRP = {
  type: 'native',
  clientId: 'mdoc-wire-shape-test',
  query: [{
    format: ['mso_mdoc'],
    fields: {
      'org.iso.18013.5.1': ['given_name', 'family_name']
    }
  }],
  clientSecret: 'shhh',
  oidc: {redirectUri: 'https://example.com'}
};

const EXPECTED_KEYS = [
  'version', 'docRequests', 'deviceRequestInfo', 'readerAuthAll'
];

const COSE_HDR_X5CHAIN = 33;
const signingAlgorithm = {
  name: 'ECDSA',
  namedCurve: 'P-256',
  hash: 'SHA-256'
};

/**
 * Mint a self-signed leaf PEM with SAN DNS for bedrock hostname checks.
 *
 * @param {object} options - Options object.
 * @param {string[]} options.sanHosts - SAN DNS names.
 * @returns {Promise<{privateKeyPem: string, publicKeyPem: string,
 *   certificatePem: string}>} PEM material for walletCertificates.
 */
async function mintWalletCertPems({sanHosts}) {
  const {Crypto} = await import('@peculiar/webcrypto');
  const webcrypto = new Crypto();
  const {
    SubjectAlternativeNameExtension,
    X509CertificateGenerator
  } = await import('@peculiar/x509');
  const keys = await webcrypto.subtle.generateKey(
    signingAlgorithm, true, ['sign', 'verify']);
  const now = new Date();
  const cert = await X509CertificateGenerator.createSelfSigned({
    name: 'CN=opencred-test-reader, O=OpenCred Test',
    notBefore: now,
    notAfter: new Date(now.getFullYear() + 10, now.getMonth(), now.getDate()),
    signingAlgorithm,
    keys,
    extensions: [
      new SubjectAlternativeNameExtension(
        sanHosts.map(value => ({type: 'dns', value}))
      )
    ]
  }, webcrypto);
  const privateKey = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
  const publicKey = await webcrypto.subtle.exportKey('spki', keys.publicKey);
  const b64Lines = (der, label) => {
    const b64 = Buffer.from(der).toString('base64');
    const wrapped = b64.match(/.{1,64}/g).join('\n');
    return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
  };
  return {
    privateKeyPem: b64Lines(privateKey, 'PRIVATE KEY'),
    publicKeyPem: b64Lines(publicKey, 'PUBLIC KEY'),
    certificatePem: cert.toString('pem')
  };
}

describe('apple-wallet DC API wire shape', function() {
  let rpStub;
  let baseUriStub;
  let signingKeysStub;
  let walletCertStub;
  let findOneStub;
  let replaceOneStub;
  let walletEntryWithSan;

  before(async function() {
    const pems = await mintWalletCertPems({sanHosts: ['example.com']});
    walletEntryWithSan = {
      ...appleWalletTestEntry,
      ...pems
    };
  });

  beforeEach(function() {
    rpStub = sinon.stub(config.opencred, 'workflows').value([mdocTestRP]);
    baseUriStub = sinon.stub(config.server, 'baseUri').value(
      'https://example.com'
    );
    signingKeysStub = sinon.stub(config.opencred, 'signingKeys').value(
      [{...exampleKey2, purpose: ['authorization_request']}]
    );
    walletCertStub = sinon.stub(config.opencred, 'walletCertificates').value(
      [walletEntryWithSan]
    );
  });

  afterEach(function() {
    rpStub.restore();
    baseUriStub.restore();
    signingKeysStub.restore();
    walletCertStub.restore();
    if(findOneStub) {
      findOneStub.restore();
    }
    if(replaceOneStub) {
      replaceOneStub.restore();
    }
  });

  it('emits a 4-key CBOR map; readerAuthAll[0] is a 4-element array ' +
    'with null payload and a SAN-matched leaf cert', async function() {
    const exchange = await createExchangeWithAuthRequest({
      workflow: mdocTestRP});
    findOneStub = sinon.stub(database.collections.Exchanges, 'findOne')
      .resolves({...exchange, workflowId: mdocTestRP.clientId});
    replaceOneStub = sinon.stub(
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

    expect(err).to.be(undefined);
    expect(result.status).to.equal(200);
    expect(result.data.dcApiRequest).to.be.an('object');

    const {dcApiRequest} = result.data;
    expect(dcApiRequest.protocol).to.equal('org-iso-mdoc');

    const drBytes = Buffer.from(
      dcApiRequest.data.deviceRequest, 'base64url'
    );
    const decoded = cborDecode(new Uint8Array(drBytes));

    expect(decoded).to.be.a(Map);
    const keys = [...decoded.keys()];
    expect(keys.sort()).to.eql([...EXPECTED_KEYS].sort());

    const readerAuthAll = decoded.get('readerAuthAll');
    expect(readerAuthAll).to.be.an('array');
    expect(readerAuthAll.length).to.be.greaterThan(0);

    const entry = readerAuthAll[0];
    expect(entry).to.be.an(Array);
    expect(entry.length).to.equal(4);
    expect(entry[0]).to.be.a(Uint8Array);
    expect(entry[1]).to.be.a(Map);
    expect(entry[2]).to.equal(null);
    expect(entry[3]).to.be.a(Uint8Array);

    const x5chain = entry[1].get(COSE_HDR_X5CHAIN);
    expect(x5chain).to.be.ok();
    const leafDer = Array.isArray(x5chain) ? x5chain[0] : x5chain;
    expect(leafDer).to.be.a(Uint8Array);
    const {SubjectAlternativeNameExtension, X509Certificate} = await import(
      '@peculiar/x509');
    const leaf = new X509Certificate(leafDer);
    const ext = leaf.getExtension(SubjectAlternativeNameExtension);
    expect(ext).to.be.ok();
    const expectedHost = new URL(config.server.baseUri).hostname;
    const dnsNames = ext.names.items.filter(n => n.type === 'dns')
      .map(n => n.value);
    expect(dnsNames).to.contain(expectedHost);
  });
});
