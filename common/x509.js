import * as x509 from '@peculiar/x509';
// import {Certificate, CertificateRevocationList} from 'pkijs';
import {createPublicKey, X509Certificate} from 'node:crypto';
import {config} from '../config/config.js';
import ocsp from 'ocsp';

const checkDates = cert => {
  const now = new Date();
  const validFrom = new Date(cert.validFrom);
  const validTo = new Date(cert.validTo);
  if(now < validFrom || now > validTo) {
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

const checkTrust = async certs => {
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
      for(const caCertRaw of config.caStore) {
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

export const verifyX509 = async certs => {
  try {
    let errors = [];
    for(const cert of certs) {
      // Verify Expiration Date
      const datesVerify = checkDates(cert);
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
    const trustVerify = await checkTrust(certs);
    if(!trustVerify.verified) {
      errors = errors.concat(trustVerify.errors);
    }
    return {verified: errors.length === 0, errors};
  } catch(e) {
    console.error(e);
    return {verified: false, errors: [e.message]};
  }
};

export const verifyJWKx509 = async jwk => {
  try {
    const certs = jwk.x5c.map(x5c =>
      new X509Certificate(Buffer.from(x5c, 'base64')));

    // Verify public key matches certificate
    const key = createPublicKey({key: jwk, format: 'jwk'});
    if(!certs[0].publicKey.equals(key)) {
      return {
        verified: false,
        errors: ['Public key is not found in leaf certificate']
      };
    }
    return await verifyX509(certs);
  } catch(e) {
    console.error(e);
    return {verified: false, errors: [e.message]};
  }
};
