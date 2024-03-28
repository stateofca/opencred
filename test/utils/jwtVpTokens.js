/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {exportJWK, generateKeyPair, SignJWT} from 'jose';
import {generateValidCredential} from './credentials.js';

class Signer {
  constructor(privateKey, header) {
    this.privateKey = privateKey;
    this.header = header;
  }

  async sign(payload) {
    const jwtSigner = new SignJWT(payload);
    jwtSigner.setProtectedHeader(this.header);
    return jwtSigner.sign(this.privateKey);
  }
}

export const generateValidJwtVpToken = async ({
  alg = 'ES256',
  crv = 'P-256',
  aud = 'did:web:localhost:8080'
} = {}) => {
  const {privateKey, publicKey} = await generateKeyPair(
    alg, {crv, extractable: true});
  const publicKeyJwk = await exportJWK(publicKey);

  const issuerDidFingerprint = btoa(JSON.stringify(publicKeyJwk));
  const issuerDid = `did:jwk:${issuerDidFingerprint}`;
  const holderDid = issuerDid;
  const keyId = `${issuerDid}#0`;
  const header = {
    typ: 'JWT',
    alg,
    kid: keyId
  };

  const issuanceDate = new Date();
  const iat = Math.ceil(issuanceDate.getTime() / 1000);

  const expirationDate = new Date(
    issuanceDate.getFullYear() + 1,
    issuanceDate.getMonth(),
    issuanceDate.getDate()
  );
  const exp = Math.ceil(expirationDate.getTime() / 1000);

  const signer = new Signer(privateKey, header);

  const vcPayload = {
    iat,
    exp,
    iss: issuerDid,
    sub: holderDid,
    vc: generateValidCredential({
      issuerDid,
      holderDid
    })
  };
  const signedVcPayload = await signer.sign(vcPayload);

  const vpPayload = {
    iat,
    exp,
    iss: issuerDid,
    sub: holderDid,
    aud,
    vp: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      verifiableCredential: [signedVcPayload]
    }
  };
  const signedVpPayload = await signer.sign(vpPayload);

  return {vpToken: signedVpPayload, issuerDid, issuanceDate};
};
