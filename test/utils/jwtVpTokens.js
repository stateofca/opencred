/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {exportJWK, generateKeyPair, importJWK, SignJWT} from 'jose';
import base64url from 'base64url';
import {Crypto} from '@peculiar/webcrypto';
import {generateValidCredential} from './credentials.js';
import {isValidJwt} from '../../common/utils.js';

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
  innerIssuerDid = null,
  challenge = null
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
  // Include nonce if provided (required for OID4VP challenge verification)
  if(challenge) {
    vpPayload.nonce = challenge;
  }
  const signedVpPayload = await signer.sign(vpPayload);

  return {
    vpToken: signedVpPayload,
    vcToken: signedVcPayload,
    issuerDid, issuanceDate
  };
};

/**
 * Generates a presentation_submission that matches an authorization request.
 *
 * @param {object} options - Options for submission generation.
 * @param {object} options.authorizationRequest - The authorization request
 *   containing presentation_definition.
 * @param {string | object} options.vpToken - The VP token (JWT string or
 *   LDP object).
 * @returns {object} - Presentation submission object with id, definition_id,
 *   and descriptor_map.
 */
export const generatePresentationSubmission = ({
  authorizationRequest,
  vpToken
}) => {
  const {presentation_definition} = authorizationRequest;

  if(!presentation_definition) {
    throw new Error(
      'authorizationRequest must contain presentation_definition');
  }

  if(!presentation_definition.input_descriptors ||
    !Array.isArray(presentation_definition.input_descriptors)) {
    throw new Error(
      'presentation_definition must contain input_descriptors array');
  }

  // Determine format based on vpToken type
  const isJwt = typeof vpToken === 'string' && isValidJwt(vpToken);
  const vpFormat = isJwt ? 'jwt_vp_json' : 'ldp_vp';
  // For nested VC format, use jwt_vc_json for JWT VCs
  const vcFormat = isJwt ? 'jwt_vc_json' : 'ldp_vc';
  // Path for nested VC: $.verifiableCredential[0] for both JWT and LDP
  // (JWT VPs are decoded to verifiablePresentation structure with
  // verifiableCredential array, not vc property)
  const nestedPath = '$.verifiableCredential[0]';

  // Generate descriptor_map entries for each input_descriptor
  const descriptor_map = presentation_definition.input_descriptors.map(
    inputDescriptor => ({
      id: inputDescriptor.id,
      path: '$',
      format: vpFormat,
      path_nested: {
        format: vcFormat,
        path: nestedPath
      }
    })
  );

  return {
    id: `urn:uuid:${globalThis.crypto.randomUUID()}`,
    definition_id: presentation_definition.id,
    descriptor_map
  };
};
