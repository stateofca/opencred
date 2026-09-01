/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Field-by-field diff of two audit payloads.
 *
 * @param {object} options - Options object.
 * @param {object} options.left - Left audit payload.
 * @param {object} options.right - Right audit payload.
 * @returns {{
 *   matches: string[],
 *   differences: Array<{
 *     path: string,
 *     left: any,
 *     right: any,
 *     kind: 'shape'|'value'|'missing-left'|'missing-right'
 *   }>,
 *   wireShapeDelta: object|null
 * }} Structured diff result.
 */
export function compareAudits({left, right}) {
  const matches = [];
  const differences = [];
  let wireShapeDelta = null;

  _compareTopLevelKeys({left, right, matches, differences});
  _compareDocRequests({left, right, matches, differences});
  _compareDeviceRequestInfo({left, right, matches, differences});
  wireShapeDelta = _compareReaderAuthAll({left, right, matches, differences});
  _compareCertificates({left, right, matches, differences});

  return {matches, differences, wireShapeDelta};
}

function _compareTopLevelKeys({left, right, matches, differences}) {
  const path = 'deviceRequest.topLevelKeys';
  const leftVal = left.deviceRequest?.topLevelKeys;
  const rightVal = right.deviceRequest?.topLevelKeys;
  if(_jsonEqual(leftVal, rightVal)) {
    matches.push(path);
    return;
  }
  differences.push({
    path,
    left: leftVal,
    right: rightVal,
    kind: leftVal == null ? 'missing-left' :
      rightVal == null ? 'missing-right' : 'value'
  });
}

function _compareDocRequests({left, right, matches, differences}) {
  const leftDocs = left.deviceRequest?.docRequests ?? [];
  const rightDocs = right.deviceRequest?.docRequests ?? [];
  const count = Math.max(leftDocs.length, rightDocs.length);

  for(let i = 0; i < count; i++) {
    const leftDoc = leftDocs[i];
    const rightDoc = rightDocs[i];
    const base = `deviceRequest.docRequests[${i}]`;

    if(leftDoc == null) {
      differences.push({
        path: base,
        left: null,
        right: rightDoc?.docType,
        kind: 'missing-left'
      });
      continue;
    }
    if(rightDoc == null) {
      differences.push({
        path: base,
        left: leftDoc.docType,
        right: null,
        kind: 'missing-right'
      });
      continue;
    }

    const docTypePath = `${base}.docType`;
    if(leftDoc.docType === rightDoc.docType) {
      matches.push(docTypePath);
    } else {
      differences.push({
        path: docTypePath,
        left: leftDoc.docType,
        right: rightDoc.docType,
        kind: 'value'
      });
    }

    _compareNameSpaces({
      leftNs: leftDoc.nameSpaces,
      rightNs: rightDoc.nameSpaces,
      base: `${base}.nameSpaces`,
      matches,
      differences
    });
  }
}

function _compareNameSpaces({
  leftNs, rightNs, base, matches, differences
}) {
  const left = leftNs ?? {};
  const right = rightNs ?? {};
  const nsNames = new Set([...Object.keys(left), ...Object.keys(right)]);

  for(const ns of nsNames) {
    const leftFields = left[ns] ?? {};
    const rightFields = right[ns] ?? {};
    const fieldNames = new Set([
      ...Object.keys(leftFields),
      ...Object.keys(rightFields)
    ]);

    for(const field of fieldNames) {
      const path = `${base}.${ns}.${field}.intent_to_retain`;
      const leftVal = leftFields[field];
      const rightVal = rightFields[field];
      if(leftVal === undefined) {
        differences.push({
          path,
          left: null,
          right: rightVal,
          kind: 'missing-left'
        });
      } else if(rightVal === undefined) {
        differences.push({
          path,
          left: leftVal,
          right: null,
          kind: 'missing-right'
        });
      } else if(leftVal === rightVal) {
        matches.push(path);
      } else {
        differences.push({
          path,
          left: leftVal,
          right: rightVal,
          kind: 'value'
        });
      }
    }
  }
}

function _compareDeviceRequestInfo({left, right, matches, differences}) {
  const path = 'deviceRequest.deviceRequestInfo.useCases';
  const leftVal = left.deviceRequest?.deviceRequestInfo?.useCases;
  const rightVal = right.deviceRequest?.deviceRequestInfo?.useCases;
  if(_jsonEqual(leftVal, rightVal)) {
    matches.push(path);
    return;
  }
  differences.push({
    path,
    left: leftVal,
    right: rightVal,
    kind: leftVal == null ? 'missing-left' :
      rightVal == null ? 'missing-right' : 'shape'
  });
}

function _compareReaderAuthAll({left, right, matches, differences}) {
  const leftEntries = left.deviceRequest?.readerAuthAll ?? [];
  const rightEntries = right.deviceRequest?.readerAuthAll ?? [];
  const count = Math.max(leftEntries.length, rightEntries.length);
  const leftShapes = [];
  const rightShapes = [];
  let shapesDiffer = false;

  for(let i = 0; i < count; i++) {
    const leftEntry = leftEntries[i];
    const rightEntry = rightEntries[i];
    const shapePath = `deviceRequest.readerAuthAll[${i}].shape`;
    const payloadPath =
      `deviceRequest.readerAuthAll[${i}].payloadKind`;

    leftShapes.push(leftEntry?.shape ?? null);
    rightShapes.push(rightEntry?.shape ?? null);

    if(leftEntry == null) {
      differences.push({
        path: shapePath,
        left: null,
        right: rightEntry?.shape,
        kind: 'missing-left'
      });
      shapesDiffer = true;
      continue;
    }
    if(rightEntry == null) {
      differences.push({
        path: shapePath,
        left: leftEntry.shape,
        right: null,
        kind: 'missing-right'
      });
      shapesDiffer = true;
      continue;
    }

    if(leftEntry.shape === rightEntry.shape) {
      matches.push(shapePath);
    } else {
      differences.push({
        path: shapePath,
        left: leftEntry.shape,
        right: rightEntry.shape,
        kind: 'shape'
      });
      shapesDiffer = true;
    }

    if(leftEntry.payloadKind === rightEntry.payloadKind) {
      matches.push(payloadPath);
    } else {
      differences.push({
        path: payloadPath,
        left: leftEntry.payloadKind,
        right: rightEntry.payloadKind,
        kind: 'shape'
      });
    }
  }

  if(!shapesDiffer) {
    matches.push('deviceRequest.readerAuthAll[*].shape');
    return null;
  }
  return {left: leftShapes, right: rightShapes};
}

function _compareCertificates({left, right, matches, differences}) {
  const leftLeaf = left.certificates?.leaf;
  const rightLeaf = right.certificates?.leaf;

  if(leftLeaf == null && rightLeaf == null) {
    matches.push('certificates.leaf');
    return;
  }
  if(leftLeaf == null) {
    differences.push({
      path: 'certificates.leaf',
      left: null,
      right: rightLeaf?.subjectCN,
      kind: 'missing-left'
    });
    return;
  }
  if(rightLeaf == null) {
    differences.push({
      path: 'certificates.leaf',
      left: leftLeaf.subjectCN,
      right: null,
      kind: 'missing-right'
    });
    return;
  }

  const sanPath = 'certificates.leaf.sanDnsNames';
  if(_jsonEqual(leftLeaf.sanDnsNames, rightLeaf.sanDnsNames)) {
    matches.push(sanPath);
  } else {
    differences.push({
      path: sanPath,
      left: leftLeaf.sanDnsNames,
      right: rightLeaf.sanDnsNames,
      kind: 'value'
    });
  }

  const sigPath = 'certificates.leaf.signatureAlgorithm';
  if(leftLeaf.signatureAlgorithm === rightLeaf.signatureAlgorithm) {
    matches.push(sigPath);
  } else {
    differences.push({
      path: sigPath,
      left: leftLeaf.signatureAlgorithm,
      right: rightLeaf.signatureAlgorithm,
      kind: 'value'
    });
  }
}

function _jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
