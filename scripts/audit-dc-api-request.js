/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {buildAuditPayload} from './dc-api-request-audit/report.js';
import {compareAudits} from './dc-api-request-audit/compare.js';
import {decodeDeviceRequestB64} from './dc-api-request-audit/decode.js';
import {decodeEncryptionInfoB64} from './dc-api-request-audit/decode.js';
import {renderDiffPretty} from './dc-api-request-audit/report.js';
import {renderPretty} from './dc-api-request-audit/report.js';

const USAGE =
  'Usage: node scripts/audit-dc-api-request.js \\\n' +
  '  --device-request <base64url> \\\n' +
  '  [--encryption-info <base64url>] \\\n' +
  '  [--compare <base64url deviceRequest>] \\\n' +
  '  [--pretty]';

async function main() {
  const parsed = _parseArgv({argv: process.argv.slice(2)});
  if(!parsed.deviceRequest) {
    console.error(USAGE);
    process.exit(1);
  }

  const decoded = decodeDeviceRequestB64({
    deviceRequest: parsed.deviceRequest
  });
  const encryptionInfo = parsed.encryptionInfo ?
    decodeEncryptionInfoB64({encryptionInfo: parsed.encryptionInfo}) :
    undefined;
  const audit = buildAuditPayload({deviceRequest: decoded, encryptionInfo});

  if(parsed.compare) {
    const decodedCompare = decodeDeviceRequestB64({
      deviceRequest: parsed.compare
    });
    const auditCompare = buildAuditPayload({
      deviceRequest: decodedCompare,
      encryptionInfo
    });
    const diff = compareAudits({left: audit, right: auditCompare});

    if(parsed.pretty) {
      console.log(renderPretty({audit}));
      console.log('---');
      console.log(renderPretty({audit: auditCompare}));
      console.log(renderDiffPretty({diff}));
      return;
    }

    console.log(JSON.stringify({
      left: audit,
      right: auditCompare,
      diff
    }, null, 2));
    return;
  }

  if(parsed.pretty) {
    console.log(renderPretty({audit}));
    return;
  }

  console.log(JSON.stringify(audit, null, 2));
}

/**
 * Parse CLI flags from argv.
 *
 * @param {object} options - Options object.
 * @param {string[]} options.argv - Arguments after `node script`.
 * @returns {{
 *   deviceRequest?: string,
 *   encryptionInfo?: string,
 *   compare?: string,
 *   pretty: boolean
 * }} Parsed CLI flag values.
 */
function _parseArgv({argv}) {
  const result = {pretty: false};
  for(let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if(arg === '--device-request') {
      result.deviceRequest = argv[++i];
    } else if(arg === '--encryption-info') {
      result.encryptionInfo = argv[++i];
    } else if(arg === '--compare') {
      result.compare = argv[++i];
    } else if(arg === '--pretty') {
      result.pretty = true;
    } else {
      console.error(`Unknown argument: ${arg}`);
      console.error(USAGE);
      process.exit(1);
    }
  }
  return result;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
