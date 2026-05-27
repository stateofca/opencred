/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {classifyReaderAuthEntry, extractX5ChainFromEntry} from
  './decode.js';
import {inspectX5Chain} from './inspect-cert.js';

const EXPECTED_TOP_LEVEL_KEYS = [
  'deviceRequestInfo',
  'docRequests',
  'readerAuthAll',
  'version'
];

/**
 * Build a structured audit payload combining a decoded device
 * request, optional decoded encryption-info, and cert inspections.
 *
 * @param {object} options - Options object.
 * @param {ReturnType<import('./decode.js').decodeDeviceRequestB64>}
 *   options.deviceRequest - Decoded device request.
 * @param {ReturnType<import('./decode.js').decodeEncryptionInfoB64>}
 *   [options.encryptionInfo] - Decoded encryption info.
 * @returns {object} Audit JSON payload ready for serialization.
 */
export function buildAuditPayload({deviceRequest, encryptionInfo}) {
  const readerAuthAll = (deviceRequest.readerAuthAll ?? []).map(
    ({elements}) => classifyReaderAuthEntry({entry: elements})
  );

  const audit = {
    deviceRequest: {
      version: deviceRequest.version,
      topLevelKeys: deviceRequest.topLevelKeys,
      topLevelKeysExpected: EXPECTED_TOP_LEVEL_KEYS,
      topLevelKeysMatch: _arraysEqual(
        deviceRequest.topLevelKeys,
        EXPECTED_TOP_LEVEL_KEYS
      ),
      docRequests: deviceRequest.docRequests,
      deviceRequestInfo: deviceRequest.deviceRequestInfo,
      readerAuthAll
    }
  };

  const x5chain = _firstX5Chain(deviceRequest.readerAuthAll);
  if(x5chain) {
    try {
      audit.certificates = inspectX5Chain({x5chain});
    } catch(err) {
      audit.certificates = {
        chainLength: _chainLength(x5chain),
        leaf: null,
        intermediates: [],
        inspectionError: err.message
      };
    }
  }

  if(encryptionInfo) {
    audit.encryptionInfo = {
      tag: encryptionInfo.tag,
      nonceLength: encryptionInfo.nonceLength,
      recipientPublicKey: _summarizeCoseKey(
        encryptionInfo.recipientPublicKey)
    };
  }

  return audit;
}

/**
 * Render the audit payload as a human-friendly text report.
 *
 * @param {object} options - Options object.
 * @param {object} options.audit - Output of `buildAuditPayload`.
 * @returns {string} Human-readable audit report text.
 */
export function renderPretty({audit}) {
  const lines = [];
  const dr = audit.deviceRequest;

  lines.push('## DeviceRequest');
  lines.push(`version: ${dr.version}`);
  lines.push(`topLevelKeys: ${dr.topLevelKeys.join(', ')}`);
  if(!dr.topLevelKeysMatch) {
    lines.push(
      `  (expected: ${EXPECTED_TOP_LEVEL_KEYS.join(', ')})`
    );
  }

  for(const [i, docReq] of (dr.docRequests ?? []).entries()) {
    lines.push('');
    lines.push(`### docRequest[${i}]`);
    lines.push(`docType: ${docReq.docType}`);
    lines.push('nameSpaces:');
    for(const [ns, fields] of Object.entries(docReq.nameSpaces ?? {})) {
      for(const [field, retain] of Object.entries(fields)) {
        lines.push(`  ${ns} / ${field} / intent_to_retain=${retain}`);
      }
    }
  }

  lines.push('');
  lines.push('### deviceRequestInfo');
  const useCases = dr.deviceRequestInfo?.useCases ?? [];
  for(const [i, uc] of useCases.entries()) {
    lines.push(
      `useCase[${i}]: mandatory=${uc.mandatory}, ` +
      `documentSets=${JSON.stringify(uc.documentSets)}`
    );
  }

  for(const [i, entry] of (dr.readerAuthAll ?? []).entries()) {
    lines.push('');
    lines.push(`### readerAuthAll[${i}]`);
    lines.push(`shape: ${entry.shape}`);
    if(entry.protectedBstrLength !== undefined) {
      lines.push(`protected bstr length: ${entry.protectedBstrLength}`);
    }
    if(entry.unprotectedHeaderKeys?.length) {
      lines.push(
        `unprotected header keys: ` +
        `${entry.unprotectedHeaderKeys.join(', ')}`
      );
    }
    if(entry.payloadKind !== undefined) {
      lines.push(`payload kind: ${entry.payloadKind}`);
    }
    if(entry.signatureLength !== undefined) {
      lines.push(`signature length: ${entry.signatureLength}`);
    }
  }

  if(audit.certificates) {
    lines.push('');
    lines.push('### x5chain');
    if(audit.certificates.inspectionError) {
      lines.push(
        `inspection error: ${audit.certificates.inspectionError}`
      );
      if(audit.certificates.chainLength != null) {
        lines.push(
          `chain length (if recoverable): ` +
          `${audit.certificates.chainLength}`
        );
      }
    } else {
      lines.push(`chain length: ${audit.certificates.chainLength}`);
      const leaf = audit.certificates.leaf;
      lines.push(`leaf subject CN: ${leaf.subjectCN}`);
      lines.push(`leaf issuer CN: ${leaf.issuerCN}`);
      if(leaf.sanDnsNames.length) {
        lines.push(`leaf SAN DNS: ${leaf.sanDnsNames.join(', ')}`);
      }
      lines.push(`validity: ${leaf.notBefore} .. ${leaf.notAfter}`);
      lines.push(`SHA-256 fingerprint: ${leaf.sha256Fingerprint}`);
      lines.push(`signature algorithm: ${leaf.signatureAlgorithm}`);
    }
  }

  if(audit.encryptionInfo) {
    lines.push('');
    lines.push('## EncryptionInfo');
    lines.push(`tag: ${audit.encryptionInfo.tag}`);
    lines.push(`nonce length: ${audit.encryptionInfo.nonceLength}`);
    const pk = audit.encryptionInfo.recipientPublicKey;
    if(pk.kty !== undefined) {
      lines.push(`recipientPublicKey kty: ${pk.kty}`);
    }
    if(pk.alg !== undefined) {
      lines.push(`recipientPublicKey alg: ${pk.alg}`);
    }
    if(pk.crv !== undefined) {
      lines.push(`recipientPublicKey crv: ${pk.crv}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Render a compare diff as a human-friendly bullet list.
 *
 * @param {object} options - Options object.
 * @param {ReturnType<import('./compare.js').compareAudits>}
 *   options.diff - Compare result.
 * @returns {string} Human-readable diff bullet list.
 */
export function renderDiffPretty({diff}) {
  const lines = ['## Diff'];
  if(diff.wireShapeDelta) {
    lines.push('wire shape delta:');
    lines.push(`  left:  ${JSON.stringify(diff.wireShapeDelta.left)}`);
    lines.push(`  right: ${JSON.stringify(diff.wireShapeDelta.right)}`);
  }
  if(diff.differences.length === 0) {
    lines.push('(no differences)');
  } else {
    for(const d of diff.differences) {
      lines.push(
        `- ${d.path} [${d.kind}]: ` +
        `left=${JSON.stringify(d.left)} ` +
        `right=${JSON.stringify(d.right)}`
      );
    }
  }
  if(diff.matches.length) {
    lines.push('');
    lines.push(`matching paths (${diff.matches.length}):`);
    for(const path of diff.matches) {
      lines.push(`  ${path}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * @param {Uint8Array|Uint8Array[]} x5chain - The x5chain value.
 * @returns {number|null} Chain length when recoverable.
 */
function _chainLength(x5chain) {
  if(x5chain == null) {
    return null;
  }
  if(Array.isArray(x5chain)) {
    return x5chain.length;
  }
  return 1;
}

/**
 * @param {Array<{elements: *}>} readerAuthAll - Decoded entries.
 * @returns {Uint8Array|Uint8Array[]|null} First x5chain found.
 */
function _firstX5Chain(readerAuthAll) {
  for(const {elements} of readerAuthAll ?? []) {
    const x5 = extractX5ChainFromEntry({entry: elements});
    if(x5) {
      return x5;
    }
  }
  return null;
}

/**
 * @param {object} coseKey - Plain COSE_Key object.
 * @returns {object} Summary fields for reporting.
 */
function _summarizeCoseKey(coseKey) {
  const summary = {};
  for(const key of ['kty', 'alg', 'crv', 'kid']) {
    if(coseKey[key] !== undefined) {
      summary[key] = coseKey[key];
    }
  }
  return summary;
}

/**
 * @param {Array} a - First array.
 * @param {Array} b - Second array.
 * @returns {boolean} True when arrays are equal element-wise.
 */
function _arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && a.every((v, i) => v === b[i]);
}
