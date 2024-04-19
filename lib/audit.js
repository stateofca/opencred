/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {decodeJwtPayload, verifyUtils} from '../common/utils.js';
import {
  getDocumentLoader,
  getOverrideDidResolver
} from '../common/documentLoader.js';
import {
  getFieldMatches,
  getIssuerDidDocumentOverrides,
  getIssuerDidsForVpToken,
  getVcTokensForVpToken
} from '../common/audit.js';
import {config} from '@bedrock/core';
import {extractCertsFromX5C} from '../common/x509.js';
import {SUITES} from '../common/suites.js';

export const auditPresentation = async (req, res) => {
  if(!config.opencred.enableAudit) {
    return res.status(501).send({
      verified: false,
      matches: {},
      message: 'Auditing is not enabled for this system.'
    });
  }

  const vpToken = req.body.vpToken;
  const fields = req.body.fields;

  let matches = {};
  try {
    try {
      if(fields && Object.entries(fields).length) {
        matches = getFieldMatches(vpToken, fields);
      }
    } catch(error) {
      return res.status(400).send({
        verified: false,
        matches,
        message: error.message
      });
    }

    if(typeof vpToken === 'string') {
      const issuerDids = getIssuerDidsForVpToken(vpToken);
      const vpJwtPayload = decodeJwtPayload(vpToken);
      const presentationDate = vpJwtPayload.iat ?
        new Date(vpJwtPayload.iat * 1000) :
        null;

      if(!presentationDate) {
        return res.status(400).send({
          verified: false,
          matches,
          message: 'Decoded vp token must contain an issuance date at "$.iat"'
        });
      }

      let didDocumentOverrides;
      try {
        didDocumentOverrides =
          await getIssuerDidDocumentOverrides(issuerDids, presentationDate);
      } catch(error) {
        return res.status(400).send({
          verified: false,
          matches,
          message: error.message
        });
      }

      const resolver = getOverrideDidResolver(didDocumentOverrides);

      const vcTokens = getVcTokensForVpToken(vpToken);
      let verificationErrors = [];
      for(const vcToken of vcTokens) {
        const vcResult = await verifyUtils.verifyCredentialJWT(vcToken, {
          resolver,
          skewTime: presentationDate.getTime()
        });
        if(!vcResult.verified) {
          verificationErrors = verificationErrors.concat(vcResult.errors);
        } else {
          const certs = await extractCertsFromX5C(
            vcResult.signer.publicKeyJwk
          );
          if(!certs) {
            verificationErrors.push(
              'Invalid certificate in x5c claim'
            );
          } else {
            const certResult = await verifyUtils.verifyx509JWT(certs, {
              presentationDate,
              caSource: 'database'
            });
            if(!certResult.verified) {
              verificationErrors =
                verificationErrors.concat(certResult.errors);
            }
          }
        }
      }
      if(verificationErrors.length !== 0) {
        return res.status(400).send({
          verified: false,
          matches,
          message: verificationErrors.join('\n')
        });
      }

      const vpResult = await verifyUtils.verifyPresentationJWT(
        vpToken, {
          audience: vpJwtPayload.aud,
          resolver,
          skewTime: presentationDate.getTime()
        });
      if(!vpResult.verified) {
        return res.status(400).send({
          verified: false,
          matches,
          message: vpResult.errors[0]
        });
      }
    } else if(typeof vpToken === 'object') {
      const issuerDids = getIssuerDidsForVpToken(vpToken);
      const presentationDate = vpToken.proof?.created ?
        new Date(vpToken.proof?.created) :
        null;

      if(!presentationDate) {
        return res.status(400).send({
          verified: false,
          matches,
          message: 'vp token must contain an issuance date at "$.proof.created"'
        });
      }

      let didDocumentOverrides;
      try {
        didDocumentOverrides =
          await getIssuerDidDocumentOverrides(issuerDids, presentationDate);
      } catch(error) {
        return res.status(400).send({
          verified: false,
          matches,
          message: error.message
        });
      }

      let documentLoader = getDocumentLoader();
      for(const [did, didDocument] of Object.entries(didDocumentOverrides)) {
        documentLoader.addStatic(did, didDocument);
      }
      documentLoader = documentLoader.build();

      const vpResult = await verifyUtils.verifyPresentationDataIntegrity({
        presentation: vpToken,
        challenge: vpToken.proof?.challenge,
        documentLoader,
        suite: SUITES,
        now: presentationDate
      });
      if(!vpResult.verified) {
        return res.status(400).send({
          verified: false,
          matches,
          message:
            verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult)
        });
      }
    } else {
      return res.status(400).send({
        verified: false,
        matches,
        message: 'Invalid format of "vpToken"'
      });
    }
  } catch(error) {
    return res.status(500).send({
      verified: false,
      matches,
      message: error.message
    });
  }

  return res.status(200).send({
    verified: true,
    matches,
    message: 'Success'
  });
};
