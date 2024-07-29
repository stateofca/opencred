/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as x509 from '@peculiar/x509';
// import {Certificate, CertificateRevocationList} from 'pkijs';
import {createPublicKey, X509Certificate} from 'node:crypto';
import {config} from '@bedrock/core';
import {database} from '../lib/database.js';
import {logger} from '../lib/logger.js';
import ocsp from 'ocsp';

const checkDates = (cert, presentationDate = new Date()) => {
  if(!(presentationDate instanceof Date)) {
    return {verified: false, errors: '"presentationDate" must be a valid date'};
  }
  const validFrom = new Date(cert.validFrom);
  const validTo = new Date(cert.validTo);
  if(presentationDate < validFrom || presentationDate > validTo) {
    return {verified: false, errors: [
      'Certificate is not valid at the current time'
    ]};
  }
  return {verified: true, errors: []};
};

const checkKeyUsage = cert => {
  const pec = new x509.X509Certificate(cert.toString());
  const keyUsages = pec.getExtension('2.5.29.15'); // key usage extension
  if(keyUsages) {
    const keyUsageBuffer = new Uint8Array(keyUsages.value);
    // The actual key usage data starts at the 4th byte
    const keyUsageByte = keyUsageBuffer[3];
    // 0x80 is the bit for digital signatures (RFC5280)
    const hasDigitalSignature = (keyUsageByte & 0x80) === 0x80;
    if(hasDigitalSignature) {
      return {verified: true, errors: []};
    }
  }
  return {verified: false, errors: [
    `Certificate doesn't have digital signature key usage`
  ]};
};

const checkRevocation = async (cert, issuer, i) => {
  const errors = [];
  if(cert.infoAccess !== undefined) {
    await new Promise(resolve => {
      ocsp.check({
        cert: cert.raw,
        issuer: issuer.raw
      }, function(err, res) {
        if(err !== null || res.type !== 'good') {
          errors.push(
            `x509 cert ${i} (${cert.fingerprint}) has been revoked (OCSP)`
          );
        }
        resolve();
      });
    });
  }

  /*
  * TEMPORARILY DISABLED UNTIL CRL READY
  *
  *
  const certificate = Certificate.fromBER(cert.raw);
  // CRL distribution point extension
  const ext = certificate.extensions.find(ext => ext.extnID === '2.5.29.31');
  if(ext) {
    const crlURIs = new Set([]);
    for(const points of ext.parsedValue.distributionPoints) {
      for(const point of points.distributionPoint) {
        crlURIs.add(point.value);
      }
    }
    for(const uri of crlURIs) {
      const resp = await fetch(uri);
      if(resp.status === 200) {
        const crlBER = await resp.arrayBuffer();
        const crl = CertificateRevocationList.fromBER(crlBER);
        const revoked = crl.isCertificateRevoked(Certificate.fromBER(cert.raw));
        if(revoked) {
          errors.push(`x509 certificate has been revoked (CRL)`);
        }
      } else {
        errors.push(`Failed to query CRL at ${uri} - Received ${resp.status}`);
      }
    }
  }
  */
  return {verified: errors.length === 0, errors};
};

const checkSignature = async (cert, parentCert, i) => {
  const errors = [];

  // verify signature
  const verified = cert.verify(parentCert.publicKey);
  if(!verified) {
    errors.push(`X509 cert ${i} (${cert.fingerprint}) in chain invalid`);
  }

  return {verified: errors.length === 0, errors};
};

const checkTrust = async (certs, caSource = 'config') => {
  let rootCerts;
  switch(caSource) {
    case 'config':
      rootCerts = config.opencred.caStore;
      break;
    case 'database':
      rootCerts = (
        await database.collections.RootCertificates
          .find()
          .toArray()
      ).map(cert => cert.certificate);
      break;
    default:
      return {
        verified: false,
        errors: ['"caSource" must be "config" or "database"']
      };
  }
  let errors = [];
  for(let i = 0; i < certs.length; i++) {
    if(i < certs.length - 1) {
      const issued = certs[i].checkIssued(certs[i + 1]);
      if(!issued) {
        errors.push(`X509 certificate at index ${i} not issued by parent.`);
      } else {
        const verified = await checkSignature(certs[i], certs[i + 1], i);
        if(!verified.verified) {
          errors = errors.concat(verified.errors);
        }
        const revocation = await checkRevocation(certs[i], certs[i + 1], i);
        if(!revocation.verified) {
          errors = errors.concat(revocation.errors);
        }
      }
    } else {
      // Issuer in CA Store
      let found = false;
      for(const caCertRaw of rootCerts) {
        const caCert = new X509Certificate(caCertRaw);
        if(certs[i].checkIssued(caCert)) {
          found = true;
          const verified = await checkSignature(certs[i], caCert, i);
          if(!verified.verified) {
            errors = errors.concat(verified.errors);
          }
          const revocation = await checkRevocation(certs[i], caCert, i);
          if(!revocation.verified) {
            errors = errors.concat(revocation.errors);
          }
          break;
        }
      }
      if(!found) {
        errors.push(
          `Issuer of X509 certificate at index ${i} not found in CA store`);
      }
    }
    i++;
  }
  return {verified: errors.length === 0, errors};
};

export const verifyChain = async (certs, options = {}) => {
  try {
    let errors = [];
    for(const cert of certs) {
      // Verify Expiration Date
      const datesVerify = checkDates(cert, options?.presentationDate);
      if(!datesVerify.verified) {
        errors = errors.concat(datesVerify.errors);
      }

      // Check Key Usage
      const keyUsageVerify = checkKeyUsage(cert);
      if(!keyUsageVerify.verified) {
        errors = errors.concat(keyUsageVerify.errors);
      }
    }

    // Check Trust
    const trustVerify = await checkTrust(certs, options?.caSource);
    if(!trustVerify.verified) {
      errors = errors.concat(trustVerify.errors);
    }
    return {verified: errors.length === 0, errors};
  } catch(error) {
    logger.error(error.message, {error});
    return {verified: false, errors: [error.message]};
  }
};

export const extractCertsFromX5C = async jwk => {
  try {
    const certs = jwk.x5c?.map(x5c =>
      new X509Certificate(Buffer.from(x5c, 'base64')));

    if(!certs) {
      logger.error(`x5c claim doesn't contain valid certificate`);
      return null;
    }

    // Verify public key matches certificate
    const key = createPublicKey({key: jwk, format: 'jwk'});
    if(!certs[0].publicKey.equals(key)) {
      logger.error('Public key is not found in leaf certificate');
      return null;
    }
    return certs;
  } catch(error) {
    logger.error(error.message, {error});
    return null;
  }
};
