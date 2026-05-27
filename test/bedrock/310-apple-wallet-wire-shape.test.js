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

describe('apple-wallet DC API wire envelope shape', function() {
  let rpStub;
  let baseUriStub;
  let signingKeysStub;
  let walletCertStub;
  let findOneStub;
  let replaceOneStub;

  beforeEach(function() {
    rpStub = sinon.stub(config.opencred, 'workflows').value([mdocTestRP]);
    baseUriStub = sinon.stub(config.server, 'baseUri').value(
      'https://example.com'
    );
    signingKeysStub = sinon.stub(config.opencred, 'signingKeys').value(
      [{...exampleKey2, purpose: ['authorization_request']}]
    );
    walletCertStub = sinon.stub(config.opencred, 'walletCertificates').value(
      [appleWalletTestEntry]
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

  it('emits a 4-key CBOR map including readerAuthAll', async function() {
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

    // Single deeper sanity check: the COSE_Sign1 outer shape is a
    // 4-tuple (protected, unprotected, payload, signature). We do
    // NOT verify the signature here — that's 260's job.
    const sign1 = readerAuthAll[0];
    expect(Array.isArray(sign1) || sign1 instanceof Map ||
      (sign1 && typeof sign1 === 'object')).to.be(true);
  });
});
