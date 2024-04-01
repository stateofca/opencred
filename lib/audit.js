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
  getIssuerDidsForVpToken
} from '../common/audit.js';
import {config} from '@bedrock/core';
import {domainToDidWeb} from './didWeb.js';
import {SUITES} from '../common/suites.js';

export const auditPresentation = async (req, res) => {
  if(!config.opencred.isAuditEnabled()) {
    return res.status(501).send({
      verified: false,
      matches: {},
      message: 'Auditing is not enabled for this instance.'
    });
  }

  const vpToken = req.body.vpToken;
  const fields = req.body.fields;

  let matches = {};
  if(fields && Object.entries(fields).length) {
    matches = getFieldMatches(vpToken, fields);
  }

  if(typeof vpToken === 'string') {
    const vpJwtPayload = decodeJwtPayload(vpToken);
    const issuerDid = vpJwtPayload.iss;
    const issuanceDate = vpJwtPayload.iat ?
      new Date(vpJwtPayload.iat * 1000) :
      null;

    if(!issuanceDate) {
      return res.status(400).send({
        verified: false,
        matches,
        message: 'Decoded vp token must contain an issuance date at "$.iat"'
      });
    }

    let didDocumentOverrides;
    try {
      didDocumentOverrides =
        await getIssuerDidDocumentOverrides([issuerDid], issuanceDate);
    } catch(error) {
      return res.status(400).send({
        verified: false,
        matches,
        message: error.message
      });
    }

    const resolver = getOverrideDidResolver(didDocumentOverrides);

    const vpResult = await verifyUtils.verifyPresentationJWT(
      vpToken, {
        audience: domainToDidWeb(config.server.baseUri),
        resolver,
        skewTime: issuanceDate.getTime()
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
    const issuanceDate = vpToken.proof?.created ?
      new Date(vpToken.proof?.created) :
      null;

    if(!issuanceDate) {
      return res.status(400).send({
        verified: false,
        matches,
        message: 'vp token must contain an issuance date at "$.proof.created"'
      });
    }

    let didDocumentOverrides;
    try {
      didDocumentOverrides =
        await getIssuerDidDocumentOverrides(issuerDids, issuanceDate);
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
      now: issuanceDate
    });
    if(!vpResult.verified) {
      return res.status(400).send({
        verified: false,
        matches,
        message: verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult)
      });
    }
  } else {
    return res.status(400).send({
      verified: false,
      matches,
      message: 'Invalid format of "vpToken"'
    });
  }

  return res.status(200).send({
    verified: true,
    matches,
    message: 'Success'
  });
};
