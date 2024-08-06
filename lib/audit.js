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
  getVcTokensForVpToken,
  getVpTokenMetadata
} from '../common/audit.js';
import {config} from '@bedrock/core';
import {extractCertsFromX5C} from '../common/x509.js';
import {httpClient} from '@digitalbazaar/http-client';
import {logger} from './logger.js';
import {SUITES} from '../common/suites.js';

export const auditPresentation = async (req, res) => {
  const vpToken = req.body.vpToken;
  const fields = req.body.fields;
  const reCaptchaToken = req.body.reCaptchaToken;

  let errorMessage = 'Error';
  const defaultErrorResponse = {
    verified: false,
    matches: {},
    message: 'Error'
  };

  if(!config.opencred.audit.enable) {
    return res.status(501).send({
      ...defaultErrorResponse,
      message: 'Auditing is not enabled for this system.'
    });
  }

  if(!vpToken) {
    return res.status(400).send({
      ...defaultErrorResponse,
      message: 'vpToken is required.'}
    );
  }

  if(config.opencred.reCaptcha.enable) {
    if(!reCaptchaToken) {
      return res.status(400).send({
        ...defaultErrorResponse,
        message: 'A reCAPTCHA token must be provided when reCAPTCHA is enabled.'
      });
    }

    const reCaptchaParams = new URLSearchParams();
    reCaptchaParams.append('secret', config.opencred.reCaptcha.secretKey);
    reCaptchaParams.append('response', reCaptchaToken);
    try {
      const reCaptchaResponse = await httpClient.post(
        'https://www.google.com/recaptcha/api/siteverify', {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: reCaptchaParams
        });
      if(!reCaptchaResponse.data.success) {
        errorMessage =
          'There was an error verifying the reCAPTCHA token provided.\n' +
          'This may happen if your reCAPTCHA session has expired or\n' +
          'reCAPTCHA is improperly configured in your system.';
        logger.debug('reCAPTCHA error response:', {
          reCaptchaResponse: reCaptchaResponse.data
        });
        return res.status(400).send({
          ...defaultErrorResponse,
          message: errorMessage
        });
      }

      logger.debug('reCAPTCHA success response:', {
        reCaptchaResponse: reCaptchaResponse.data
      });
    } catch(error) {
      if(error) {
        logger.error(error.message, {error});
        return res.status(400).send({
          ...defaultErrorResponse,
          message: 'There was an error verifying the reCAPTCHA token provided.'
        });
      }
    }
  }

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

    const {valid, error, issuerDids} = getVpTokenMetadata(vpToken);
    if(!valid) {
      return res.status(400).send({
        verified: false,
        matches,
        message: error
      });
    }

    if(typeof vpToken === 'string') {
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
      if(verificationErrors.length > 0) {
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
    logger.error(error.message, {error});
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
