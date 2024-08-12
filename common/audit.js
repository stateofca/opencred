/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {canonicalize} from 'json-canonicalize';
import jp from 'jsonpath';

import {
  convertJwtVpTokenToDiVp,
  decodeJwtPayload,
  getValidJson,
  isValidJson,
  isValidJwt
} from './utils.js';
import {
  didRequiresHistoricalTracking,
  didResolver
} from './documentLoader.js';
import {database} from '../lib/database.js';

export const getVpTokenMetadata = vpToken => {
  const issuerDids = [];
  if(isValidJwt(vpToken)) {
    let vpJwtPayload;
    try {
      vpJwtPayload = decodeJwtPayload(vpToken);
    } catch(error) {
      return {
        valid: false,
        error: 'Unable to decode vp token: ' + error.message,
        issuerDids
      };
    }
    const vcTokens = vpJwtPayload?.vp?.verifiableCredential;
    if(vcTokens && Array.isArray(vcTokens)) {
      for(const vcToken of vcTokens) {
        let vcJwtPayload;
        try {
          vcJwtPayload = decodeJwtPayload(vcToken);
        } catch(error) {
          return {
            valid: false,
            error: 'Unable to decode vc token: ' + error.message,
            issuerDids
          };
        }
        const issuerDidJwt = vcJwtPayload?.iss;
        const issuerDidVc = typeof vcJwtPayload?.vc?.issuer === 'string' ?
          vcJwtPayload?.vc?.issuer : vcJwtPayload?.vc?.issuer?.id;
        if(issuerDidJwt !== issuerDidVc) {
          return {
            valid: false,
            error: 'Each vc token issuer must match the issuer ' +
              'of the contained credential',
            issuerDids
          };
        }
        issuerDids.push(issuerDidJwt);
      }
    }
  } else if(isValidJson(vpToken)) {
    vpToken = getValidJson(vpToken);
    const credentials = vpToken.verifiableCredential;
    if(credentials && Array.isArray(credentials)) {
      for(const credential of credentials) {
        const issuerDidCandidate = credential?.issuer;
        const issuerDidHasValidFormat =
          typeof issuerDidCandidate === 'string' ||
          (typeof issuerDidCandidate === 'object' &&
            !Array.isArray(issuerDidCandidate) && issuerDidCandidate?.id);
        if(!issuerDidCandidate || !issuerDidHasValidFormat) {
          return {
            valid: false,
            error: 'Each credential in the vp token must have ' +
              'an issuer defined at "$.issuer".',
            issuerDids
          };
        }
        const issuerDid = typeof issuerDidCandidate === 'string' ?
          issuerDidCandidate : issuerDidCandidate?.id;
        issuerDids.push(issuerDid);
      }
    }
  } else {
    return {
      valid: false,
      error: 'Received invalid vp token format.',
      issuerDids
    };
  }
  return {valid: true, error: null, issuerDids};
};

export const getVcTokensForVpToken = vpToken => {
  const vpJwtPayload = decodeJwtPayload(vpToken);
  const vcTokens = vpJwtPayload.vp?.verifiableCredential;
  if(vcTokens && Array.isArray(vcTokens)) {
    return vcTokens;
  }
  return [];
};

export const updateIssuerDidDocumentHistory = async vpToken => {
  const {valid, issuerDids} = getVpTokenMetadata(vpToken);
  if(!valid) {
    return;
  }
  try {
    for(const did of issuerDids) {
      const didDocumentLive = await didResolver.get({did});
      const didRequiresTracking = await didRequiresHistoricalTracking(did);
      const didDocumentHistoryInfo =
        await database.collections.DidDocumentHistory
          .findOne({did});
      if(!didDocumentHistoryInfo) {
        await database.collections.DidDocumentHistory.insertOne({
          did,
          history: didRequiresTracking ?
            [{
              validFrom: new Date(),
              validUntil: null,
              didDocument: didDocumentLive
            }] :
            // Note: History will be empty for DIDs that require tracking.
            // This helps us to know whether a given instance of OpenCred
            // has encountered an issuer DID at some point in the past.
            []
        });
        continue;
      }

      // If there is already a document in DidDocumentHistory for
      // a DID that doesn't require tracking, there is nothing
      // else we need to do for that DID
      if(!didRequiresTracking) {
        continue;
      }

      // Check if the DID document has changed since we last tracked it
      const {history} = didDocumentHistoryInfo;
      const latestDidDocumentWindow = history.pop();
      const {didDocument: didDocumentCached} = latestDidDocumentWindow;
      const didDocumentLiveSerialized = canonicalize(didDocumentLive);
      const didDocumentCachedSerialized = canonicalize(didDocumentCached);

      if(didDocumentCachedSerialized !== didDocumentLiveSerialized) {
        await database.collections.DidDocumentHistory.updateOne({did}, {
          $set: {
            history: [
              ...history,
              {...latestDidDocumentWindow, validUntil: new Date()},
              {
                validFrom: new Date(),
                validUntil: null,
                didDocument: didDocumentLive
              }
            ]
          }
        });
      }
    }
  } catch(error) {
    // The failure of this function is often due to an attempt
    // for two processes to update audit data for a DID,
    // which has been configured with a unique index.
    // This should not impact user experience.
  }
};

export const getIssuerDidDocumentOverrides =
  async (issuerDids, presentationDate) => {
    const didDocumentOverrides = {};
    const errors = [];
    for(const issuerDid of issuerDids) {
      // Retrieve internally tracked document history for issuer DID
      const didDocumentHistoryInfo =
        await database.collections.DidDocumentHistory
          .findOne({did: issuerDid});

      // Report error if a DID has never been encountered in
      // this instance of OpenCred
      if(!didDocumentHistoryInfo) {
        errors.push('The system has never encountered ' +
          `issuer DID ${issuerDid}.`);
        continue;
      }

      // Skip history check if a DID doesn't require tracking
      const didRequiresTracking =
        await didRequiresHistoricalTracking(issuerDid);
      if(!didRequiresTracking) {
        continue;
      }

      // Check if presentation date is in latest tracked window entry
      const {history} = didDocumentHistoryInfo;
      const latestDidDocumentWindow = history.pop();
      const {
        validFrom: validFromLatest,
        didDocument: didDocumentLatest
      } = latestDidDocumentWindow;
      if(presentationDate >= new Date(validFromLatest)) {
        didDocumentOverrides[issuerDid] = didDocumentLatest;
        continue;
      }

      // Find the window that encompasses the presentation date
      const didDocumentWindow = history.find(w => {
        const {validFrom, validUntil} = w;
        return validFrom <= presentationDate && presentationDate < validUntil;
      });

      // If there is a window that encompasses the presentation date, return it
      if(didDocumentWindow) {
        didDocumentOverrides[issuerDid] = didDocumentWindow.didDocument;
      }
    }

    if(errors.length > 0) {
      throw new Error(errors.join('; '));
    }

    return didDocumentOverrides;
  };

const getFieldMatchesDiVp = (vpToken, fields) => {
  const credentials = vpToken.verifiableCredential;
  if(credentials && Array.isArray(credentials)) {
    return Object.fromEntries(
      Object.entries(fields)
        .map(([path, value]) => {
          const credentialMatches = credentials.some(c => {
            const credentialQueryResult = jp.query(c, path);
            const [credentialValue] = credentialQueryResult.length > 0 ?
              credentialQueryResult :
              [null];
            return value === credentialValue;
          });
          return [path, credentialMatches];
        })
    );
  } else {
    throw new Error('Received invalid vp token format.');
  }
};

export const getFieldMatches = (vpToken, fields) => {
  let diVp;
  if(typeof vpToken === 'object') {
    diVp = vpToken;
  } else if(typeof vpToken === 'string') {
    diVp = convertJwtVpTokenToDiVp(vpToken);
  }
  return getFieldMatchesDiVp(diVp, fields);
};
