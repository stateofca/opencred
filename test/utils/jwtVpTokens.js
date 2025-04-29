/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {exportJWK, generateKeyPair, importJWK, SignJWT} from 'jose';
import base64url from 'base64url';
import {Crypto} from '@peculiar/webcrypto';
import {generateValidCredential} from './credentials.js';

const crypto = new Crypto();

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
  aud = 'did:web:localhost:22443',
  template = null,
  x5c = [],
  leafKeyPair = null,
  innerIssuerDid = null
} = {}) => {
  let publicKey;
  let privateKey;
  let publicKeyJwk;
  if(leafKeyPair) {
    ({publicKey, privateKey} = leafKeyPair);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', privateKey);
    privateKey = await importJWK(privateKeyJwk);
    publicKeyJwk = await crypto.subtle.exportKey('jwk', publicKey);
  } else {
    ({publicKey, privateKey} = await generateKeyPair(
      alg, {crv, extractable: true}));
    publicKeyJwk = await exportJWK(publicKey);
  }
  publicKeyJwk.x5c = x5c;

  const issuerDidFingerprint = base64url.encode(JSON.stringify(publicKeyJwk));
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
      issuerDid: innerIssuerDid ?? issuerDid,
      holderDid,
      template,
      vcVersion: 1
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

  return {
    vpToken: signedVpPayload,
    vcToken: signedVcPayload,
    issuerDid, issuanceDate
  };
};
