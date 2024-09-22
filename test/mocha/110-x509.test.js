/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import fs from 'node:fs';

import {
  extractCertsFromX5C,
  fetchCaStoreFromConfig,
  verifyChain
} from '../../common/x509.js';
import {config} from '@bedrock/core';
import expect from 'expect.js';
import {generateCertificateChain} from '../utils/x509.js';
import {X509Certificate} from 'node:crypto';

function crlOk(crl) {
  const mockResponse = new Response(crl, {
    status: 200,
    headers: {
      'Content-type': 'application/pkix-crl'
    }
  });
  return Promise.resolve(mockResponse);
}

describe('x509', async () => {
  it('should verify valid certificate chain', async () => {
    const {chain} = await generateCertificateChain({length: 3});
    const root = chain.pop();
    const configStub = sinon.stub(config.opencred, 'caStore').value([root.raw]);

    const verifiedChain = await verifyChain(chain);

    configStub.restore();
    verifiedChain.errors.length.should.be.equal(0);
    verifiedChain.verified.should.be.equal(true);
  });

  it('should fail to verify with revocation of OCSP', async () => {
    const rootFile = fs.readFileSync('./test/fixtures/revoked-cert/root.cer');
    const intFile = fs
      .readFileSync('./test/fixtures/revoked-cert/intermediate.cer');
    const intCert = new X509Certificate(intFile);
    const leafFile = fs.readFileSync('./test/fixtures/revoked-cert/leaf.cer');
    const leafCert = new X509Certificate(leafFile);
    const configStub = sinon.stub(config.opencred, 'caStore').value([rootFile]);
    const leafValidToStub = sinon.stub(leafCert, 'validTo')
      .value('Apr 12 23:59:59 2055 GMT');
    const intValidToStub = sinon.stub(intCert, 'validTo')
      .value('Apr 12 23:59:59 2055 GMT');

    const verifiedCert = await verifyChain([leafCert, intCert]);

    configStub.restore();
    leafValidToStub.restore();
    intValidToStub.restore();
    expect(verifiedCert.verified).to.be(false);
  });

  it.skip('should fail to verify with CRL URI status 404', async () => {
    const {chain} = await generateCertificateChain({
      length: 3,
      crlEnabled: true
    });
    const root = chain.pop();
    const configStub = sinon.stub(config.opencred, 'caStore').value([root.raw]);

    const verifiedChain = await verifyChain(chain);

    configStub.restore();
    verifiedChain.errors[0].should.be.equal(
      'Failed to query CRL at http://example.com/crl - Received 404');
    expect(verifiedChain.verified).to.be(false);
  });

  it.skip('should fail to verify with CRL revoked entry', async () => {
    const {chain, crl} = await generateCertificateChain({
      length: 3,
      crlEnabled: true,
      revoked: true
    });
    const root = chain.pop();
    const configStub = sinon.stub(config.opencred, 'caStore').value([root.raw]);
    const fetchStub = sinon.stub(global, 'fetch').resolves(crlOk(crl));

    const verifiedChain = await verifyChain(chain);

    configStub.restore();
    fetchStub.restore();
    verifiedChain.errors.length.should.be.equal(1);
    verifiedChain.errors[0].should.be.equal(
      'x509 certificate has been revoked (CRL)'
    );
    expect(verifiedChain.verified).to.be(false);
  });

  it('should verify with valid CRL entry', async () => {
    const {chain, crl} = await generateCertificateChain({
      length: 3,
      crlEnabled: true,
      revoked: false
    });
    const root = chain.pop();
    const fetchStub = sinon.stub(global, 'fetch').resolves(crlOk(crl));
    const configStub = sinon.stub(config.opencred, 'caStore').value([root.raw]);

    const verifiedChain = await verifyChain(chain);

    configStub.restore();
    fetchStub.restore();
    verifiedChain.errors.length.should.be.equal(0);
    verifiedChain.verified.should.be.equal(true);
  });

  it('should fail to verify invalid test cert', async () => {
    const cert = fs.readFileSync('./test/fixtures/expired.badssl.com.cer');
    const verifiedCert = await verifyChain(
      [new X509Certificate(cert)]
    );
    expect(verifiedCert.verified).to.be(false);
  });

  it('should handle JWK x5c as DER', async () => {
    const certs = await extractCertsFromX5C({
      kty: 'RSA',
      n: 'vrjOfz9Ccdgx5nQudyhdoR17V-IubWMeOZCwX_jj0hgAsz2J_pqYW08PLbK_PdiVGK' +
        'PrqzmDIsLI7sA25VEnHU1uCLNwBuUiCO11_-7dYbsr4iJmG0Qu2j8DsVyT1azpJC_NG' +
        '84Ty5KKthuCaPod7iI7w0LK9orSMhBEwwZDCxTWq4aYWAchc8t-emd9qOvWtVMDC2BX' +
        'ksRngh6X5bUYLy6AyHKvj-nUy1wgzjYQDwHMTplCoLtU-o-8SNnZ1tmRoGE9uJkBLdh' +
        '5gFENabWnU5m1ZqZPdwS-qo-meMvVfJb6jJVWRpl2SUtCnYG2C32qvbWbjZ_jBPD5eu' +
        'nqsIo1vQ',
      e: 'AQAB',
      x5c: [`MIIDQjCCAiqgAwIBAgIGATz/FuLiMA0GCSqGSIb3DQEBBQUAMGIxCzAJB` +
            `gNVBAYTAlVTMQswCQYDVQQIEwJDTzEPMA0GA1UEBxMGRGVudmVyMRwwGgYD` +
            `VQQKExNQaW5nIElkZW50aXR5IENvcnAuMRcwFQYDVQQDEw5CcmlhbiBDYW1` +
            `wYmVsbDAeFw0xMzAyMjEyMzI5MTVaFw0xODA4MTQyMjI5MTVaMGIxCzAJBg` +
            `NVBAYTAlVTMQswCQYDVQQIEwJDTzEPMA0GA1UEBxMGRGVudmVyMRwwGgYDV` +
            `QQKExNQaW5nIElkZW50aXR5IENvcnAuMRcwFQYDVQQDEw5CcmlhbiBDYW1w` +
            `YmVsbDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAL64zn8/QnH` +
            `YMeZ0LncoXaEde1fiLm1jHjmQsF/449IYALM9if6amFtPDy2yvz3YlRij66` +
            `s5gyLCyO7ANuVRJx1NbgizcAblIgjtdf/u3WG7K+IiZhtELto/A7Fck9Ws6` +
            `SQvzRvOE8uSirYbgmj6He4iO8NCyvaK0jIQRMMGQwsU1quGmFgHIXPLfnpn` +
            `fajr1rVTAwtgV5LEZ4Iel+W1GC8ugMhyr4/p1MtcIM42EA8BzE6ZQqC7VPq` +
            `PvEjZ2dbZkaBhPbiZAS3YeYBRDWm1p1OZtWamT3cEvqqPpnjL1XyW+oyVVk` +
            `aZdklLQp2Btgt9qr21m42f4wTw+Xrp6rCKNb0CAwEAATANBgkqhkiG9w0BA` +
            `QUFAAOCAQEAh8zGlfSlcI0o3rYDPBB07aXNswb4ECNIKG0CETTUxmXl9KUL` +
            `+9gGlqCz5iWLOgWsnrcKcY0vXPG9J1r9AqBNTqNgHq2G03X09266X5CpOe1` +
            `zFo+Owb1zxtp3PehFdfQJ610CDLEaS9V9Rqp17hCyybEpOGVwe8fnk+fbEL` +
            `2Bo3UPGrpsHzUoaGpDftmWssZkhpBJKVMJyf/RuP2SmmaIzmnw9JiSlYhzo` +
            `4tpzd5rFXhjRbg4zW9C+2qok+2+qDM1iJ684gPHMIY8aLWrdgQTxkumGmTq` +
            `gawR+N5MDtdPTEQ0XfIBc2cJEUyMTY5MPvACWpkA6SdS4xSvdXK3IVfOWA==`
      ]});
    certs.length.should.be.equal(1);
  });

  it('should handle JWK x5c as base64 PEM', async () => {
    const certs = await extractCertsFromX5C({
      kty: 'RSA',
      n: 'vrjOfz9Ccdgx5nQudyhdoR17V-IubWMeOZCwX_jj0hgAsz2J_pqYW08PLbK_PdiVGK' +
        'PrqzmDIsLI7sA25VEnHU1uCLNwBuUiCO11_-7dYbsr4iJmG0Qu2j8DsVyT1azpJC_NG' +
        '84Ty5KKthuCaPod7iI7w0LK9orSMhBEwwZDCxTWq4aYWAchc8t-emd9qOvWtVMDC2BX' +
        'ksRngh6X5bUYLy6AyHKvj-nUy1wgzjYQDwHMTplCoLtU-o-8SNnZ1tmRoGE9uJkBLdh' +
        '5gFENabWnU5m1ZqZPdwS-qo-meMvVfJb6jJVWRpl2SUtCnYG2C32qvbWbjZ_jBPD5eu' +
        'nqsIo1vQ',
      e: 'AQAB',
      x5c: [
        `LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSURRakNDQWlxZ0F3SUJBZ0lHQV` +
        `R6L0Z1TGlNQTBHQ1NxR1NJYjNEUUVCQlFVQU1HSXhDekFKQgpnTlZCQVlUQWxWVE1R` +
        `c3dDUVlEVlFRSUV3SkRUekVQTUEwR0ExVUVCeE1HUkdWdWRtVnlNUnd3R2dZRApWUV` +
        `FLRXhOUWFXNW5JRWxrWlc1MGFYUjVJRU52Y25BdU1SY3dGUVlEVlFRREV3NUNjbWxo` +
        `YmlCRFlXMQp3WW1Wc2JEQWVGdzB4TXpBeU1qRXlNekk1TVRWYUZ3MHhPREE0TVRReU` +
        `1qSTVNVFZhTUdJeEN6QUpCZwpOVkJBWVRBbFZUTVFzd0NRWURWUVFJRXdKRFR6RVBN` +
        `QTBHQTFVRUJ4TUdSR1Z1ZG1WeU1Sd3dHZ1lEVgpRUUtFeE5RYVc1bklFbGtaVzUwYV` +
        `hSNUlFTnZjbkF1TVJjd0ZRWURWUVFERXc1Q2NtbGhiaUJEWVcxdwpZbVZzYkRDQ0FT` +
        `SXdEUVlKS29aSWh2Y05BUUVCQlFBRGdnRVBBRENDQVFvQ2dnRUJBTDY0em44L1FuSA` +
        `pZTWVaMExuY29YYUVkZTFmaUxtMWpIam1Rc0YvNDQ5SVlBTE05aWY2YW1GdFBEeTJ5` +
        `dnozWWxSaWo2NgpzNWd5TEN5TzdBTnVWUkp4MU5iZ2l6Y0FibElnanRkZi91M1dHN0` +
        `srSWlaaHRFTHRvL0E3RmNrOVdzNgpTUXZ6UnZPRTh1U2lyWWJnbWo2SGU0aU84TkN5` +
        `dmFLMGpJUVJNTUdRd3NVMXF1R21GZ0hJWFBMZm5wbgpmYWpyMXJWVEF3dGdWNUxFWj` +
        `RJZWwrVzFHQzh1Z01oeXI0L3AxTXRjSU00MkVBOEJ6RTZaUXFDN1ZQcQpQdkVqWjJk` +
        `YlprYUJoUGJpWkFTM1llWUJSRFdtMXAxT1p0V2FtVDNjRXZxcVBwbmpMMVh5VytveV` +
        `ZWawphWmRrbExRcDJCdGd0OXFyMjFtNDJmNHdUdytYcnA2ckNLTmIwQ0F3RUFBVEFO` +
        `QmdrcWhraUc5dzBCQQpRVUZBQU9DQVFFQWg4ekdsZlNsY0kwbzNyWURQQkIwN2FYTn` +
        `N3YjRFQ05JS0cwQ0VUVFV4bVhsOUtVTAorOWdHbHFDejVpV0xPZ1dzbnJjS2NZMHZY` +
        `UEc5SjFyOUFxQk5UcU5nSHEyRzAzWDA5MjY2WDVDcE9lMQp6Rm8rT3diMXp4dHAzUG` +
        `VoRmRmUUo2MTBDRExFYVM5VjlScXAxN2hDeXliRXBPR1Z3ZThmbmsrZmJFTAoyQm8z` +
        `VVBHcnBzSHpVb2FHcERmdG1Xc3Naa2hwQkpLVk1KeWYvUnVQMlNtbWFJem1udzlKaV` +
        `NsWWh6bwo0dHB6ZDVyRlhoalJiZzR6VzlDKzJxb2srMitxRE0xaUo2ODRnUEhNSVk4` +
        `YUxXcmRnUVR4a3VtR21UcQpnYXdSK041TUR0ZFBURVEwWGZJQmMyY0pFVXlNVFk1TV` +
        `B2QUNXcGtBNlNkUzR4U3ZkWEszSVZmT1dBPT0KLS0tLS1FTkQgQ0VSVElGSUNBVEUt` +
        `LS0tLQ==`
      ]});

    certs.length.should.be.equal(1);
  });

  it('should not handle JWK x5c as anything else', async () => {
    const certs = await extractCertsFromX5C({
      kty: 'RSA',
      n: 'vrjOfz9Ccdgx5nQudyhdoR17V-IubWMeOZCwX_jj0hgAsz2J_pqYW08PLbK_PdiVGK' +
        'PrqzmDIsLI7sA25VEnHU1uCLNwBuUiCO11_-7dYbsr4iJmG0Qu2j8DsVyT1azpJC_NG' +
        '84Ty5KKthuCaPod7iI7w0LK9orSMhBEwwZDCxTWq4aYWAchc8t-emd9qOvWtVMDC2BX' +
        'ksRngh6X5bUYLy6AyHKvj-nUy1wgzjYQDwHMTplCoLtU-o-8SNnZ1tmRoGE9uJkBLdh' +
        '5gFENabWnU5m1ZqZPdwS-qo-meMvVfJb6jJVWRpl2SUtCnYG2C32qvbWbjZ_jBPD5eu' +
        'nqsIo1vQ',
      e: 'AQAB',
      x5c: [
        `NOT A VALID CERT`
      ]});

    should.not.exist(certs);
  });

  describe('Configuration', function() {
    describe('fetchCaStoreFromConfig', function() {
      it('should fallback to root config if undefined by rp', function() {
        const rpConfig = {
          clientId: 'test_rp'
        };

        const config = {
          opencred: {
            caStore: ['ROOT'],
            relyingParties: {
              test: {
                ...rpConfig
              }
            }
          }
        };

        const result = fetchCaStoreFromConfig(
          config.opencred.caStore, rpConfig
        );

        expect(result.length).to.be(1);
        expect(result[0]).to.equal('ROOT');
      });
      it('should return empty array if defined by rp as "false"', function() {
        const rpConfig = {
          clientId: 'test_rp',
          caStore: false
        };

        const config = {
          opencred: {
            caStore: ['ROOT'],
            relyingParties: {
              test: {
                ...rpConfig
              }
            }
          }
        };

        const result = fetchCaStoreFromConfig(
          config.opencred.caStore, rpConfig
        );

        expect(result).to.be.empty();
      });
      it('should fallback to root config if "true"', function() {
        const rpConfig = {
          clientId: 'test_rp',
          caStore: true
        };

        const config = {
          opencred: {
            caStore: ['ROOT'],
            relyingParties: {
              test: {
                ...rpConfig
              }
            }
          }
        };

        const result = fetchCaStoreFromConfig(
          config.opencred.caStore, rpConfig
        );

        expect(result.length).to.be(1);
        expect(result[0]).to.equal('ROOT');
      });
      it('should return empty array if undefined', function() {
        const rpConfig = {
          clientId: 'test_rp'
        };

        const config = {
          opencred: {
            relyingParties: {
              test: {
                ...rpConfig
              }
            }
          }
        };

        const result = fetchCaStoreFromConfig(
          config.opencred.caStore, rpConfig
        );

        expect(result).to.be.empty();
      });
    });
  });
});
