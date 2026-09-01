/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Post-deploy verifier for OpenCred workflow credentials.
 *
 * Reads a rendered `combined.yaml` (v9 `relyingParties` or v10 `workflows`
 * shape) and, for each workflow, POSTs to `/workflows/{workflowId}/exchanges`
 * using HTTP Basic auth built from the workflow's `clientId`/`clientSecret`.
 * A non-2xx response indicates a misconfiguration (typically a transcription
 * error in a clientId/clientSecret or a workflow that cannot initiate an
 * exchange).
 *
 * Usage:
 *   node scripts/verifyWorkflowCredentials.js path/to/rendered-combined.yaml
 *     [--timeout=10000] [--concurrency=4].
 *
 * Exits 0 if every non-skipped workflow returned 2xx, 1 otherwise.
*/

import fs from 'node:fs';
import {parse as parseYaml} from 'yaml';
import path from 'node:path';

const ENTRA_TYPE = 'microsoft-entra-verified-id';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_CONCURRENCY = 4;
const TEMPLATE_PLACEHOLDER_RE = /\$\{[^}]+\}/;

function parseArgs(argv) {
  const args = {
    configPath: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY
  };
  for(const raw of argv) {
    if(raw.startsWith('--timeout=')) {
      const n = Number.parseInt(raw.slice('--timeout='.length), 10);
      if(!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --timeout value: ${raw}`);
      }
      args.timeoutMs = n;
    } else if(raw.startsWith('--concurrency=')) {
      const n = Number.parseInt(raw.slice('--concurrency='.length), 10);
      if(!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --concurrency value: ${raw}`);
      }
      args.concurrency = n;
    } else if(raw === '--help' || raw === '-h') {
      args.help = true;
    } else if(raw.startsWith('-')) {
      throw new Error(`Unknown option: ${raw}`);
    } else if(args.configPath === null) {
      args.configPath = raw;
    } else {
      throw new Error(`Unexpected positional argument: ${raw}`);
    }
  }
  return args;
}

function printUsage() {
  const msg =
    'Usage: node scripts/verifyWorkflowCredentials.js ' +
    '<path/to/combined.yaml> [--timeout=ms] [--concurrency=n]\n\n' +
    'POSTs to {baseUrl}/workflows/{workflowId}/exchanges with Basic auth ' +
    'built\nfrom each workflow\'s clientId/clientSecret. Exits non-zero if ' +
    'any\nnon-skipped workflow fails.';
  console.log(msg);
}

function loadConfig(configPath) {
  const absolute = path.resolve(configPath);
  if(!fs.existsSync(absolute)) {
    throw new Error(`Config file not found: ${absolute}`);
  }
  const contents = fs.readFileSync(absolute, 'utf8');
  let parsed;
  try {
    parsed = parseYaml(contents);
  } catch(e) {
    throw new Error(`Failed to parse YAML (${absolute}): ${e.message}`);
  }
  if(!parsed || typeof parsed !== 'object') {
    throw new Error(`Config did not parse to an object: ${absolute}`);
  }
  const opencred = parsed?.app?.opencred;
  if(!opencred || typeof opencred !== 'object') {
    throw new Error(
      `Config is missing \`app.opencred\` section: ${absolute}`);
  }
  return {parsed, opencred, absolute};
}

function resolveBaseUrl(parsed, absolute) {
  const server = parsed?.app?.server ?? {};
  const baseUri = typeof server.baseUri === 'string' ?
    server.baseUri.trim() : '';
  if(baseUri) {
    if(TEMPLATE_PLACEHOLDER_RE.test(baseUri)) {
      throw new Error(
        `\`app.server.baseUri\` contains an unrendered template ` +
        `placeholder (${baseUri}) in ${absolute}`);
    }
    return stripTrailingSlash(baseUri);
  }
  const host = typeof server.host === 'string' ? server.host.trim() : '';
  if(host) {
    if(TEMPLATE_PLACEHOLDER_RE.test(host)) {
      throw new Error(
        `\`app.server.host\` contains an unrendered template ` +
        `placeholder (${host}) in ${absolute}`);
    }
    return `https://${host}`;
  }
  throw new Error(
    `Could not resolve target URL: neither \`app.server.baseUri\` nor ` +
    `\`app.server.host\` is set in ${absolute}`);
}

function stripTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function detectVersionAndCollect(opencred) {
  if(Array.isArray(opencred.workflows) && opencred.workflows.length > 0) {
    return {
      version: 'v10',
      entries: opencred.workflows.map((wf, idx) => normalizeV10(wf, idx))
    };
  }
  if(Array.isArray(opencred.relyingParties) &&
    opencred.relyingParties.length > 0) {
    return {
      version: 'v9',
      entries: opencred.relyingParties.map((rp, idx) => normalizeV9(rp, idx))
    };
  }
  throw new Error(
    'Config has neither a non-empty `app.opencred.workflows` (v10) nor ' +
    '`app.opencred.relyingParties` (v9) array');
}

function normalizeV10(wf, idx) {
  return {
    label: wf?.name || wf?.clientId || `workflows[${idx}]`,
    name: wf?.name ?? null,
    type: wf?.type ?? null,
    clientId: wf?.clientId ?? null,
    clientSecret: wf?.clientSecret ?? null,
    workflowId: wf?.clientId ?? null
  };
}

function normalizeV9(rp, idx) {
  return {
    label: rp?.name || rp?.clientId || `relyingParties[${idx}]`,
    name: rp?.name ?? null,
    type: rp?.workflow?.type ?? null,
    clientId: rp?.clientId ?? null,
    clientSecret: rp?.clientSecret ?? null,
    workflowId: rp?.workflow?.id ?? null
  };
}

function classifySkip(entry) {
  if(entry.type === ENTRA_TYPE) {
    return `type=${ENTRA_TYPE} (skipped: creating an exchange requires MS ` +
      'Verified ID connectivity and is not a clean clientId/clientSecret ' +
      'check)';
  }
  if(!entry.clientId) {
    return 'missing clientId';
  }
  if(!entry.clientSecret) {
    return 'missing clientSecret';
  }
  if(!entry.workflowId) {
    return 'missing workflow id';
  }
  if(TEMPLATE_PLACEHOLDER_RE.test(entry.clientId)) {
    return `clientId contains unrendered template placeholder ` +
      `(${entry.clientId})`;
  }
  if(TEMPLATE_PLACEHOLDER_RE.test(entry.clientSecret)) {
    return 'clientSecret contains unrendered template placeholder';
  }
  if(TEMPLATE_PLACEHOLDER_RE.test(entry.workflowId)) {
    return `workflow id contains unrendered template placeholder ` +
      `(${entry.workflowId})`;
  }
  return null;
}

function basicAuthHeader(clientId, clientSecret) {
  const token = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return `Basic ${token}`;
}

async function attemptExchange({baseUrl, entry, timeoutMs}) {
  const url =
    `${baseUrl}/workflows/${encodeURIComponent(entry.workflowId)}/exchanges`;
  const headers = {
    Authorization: basicAuthHeader(entry.clientId, entry.clientSecret),
    Accept: 'application/json'
  };
  const started = Date.now();
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch(err) {
    const elapsed = Date.now() - started;
    const isTimeout = err?.name === 'TimeoutError' ||
      err?.name === 'AbortError';
    return {
      outcome: 'fail',
      status: null,
      url,
      elapsed,
      reason: isTimeout ?
        `network timeout after ${elapsed}ms (limit ${timeoutMs}ms)` :
        `network error: ${err?.message || err}`
    };
  }
  const elapsed = Date.now() - started;
  const status = response.status;
  if(status >= 200 && status < 300) {
    return {outcome: 'pass', status, url, elapsed};
  }
  let bodyText = '';
  try {
    bodyText = (await response.text()).slice(0, 400);
  } catch {
    // ignore body read failures; we still have a status
  }
  return {
    outcome: 'fail',
    status,
    url,
    elapsed,
    reason: reasonFromStatus(status, bodyText)
  };
}

function reasonFromStatus(status, bodyText) {
  const suffix = bodyText ? ` body="${bodyText}"` : '';
  if(status === 401 || status === 403) {
    return `auth rejected (HTTP ${status}); likely wrong clientSecret or ` +
      `clientId.${suffix}`;
  }
  if(status === 404) {
    return `unknown workflow id (HTTP 404); clientId/workflow.id mismatch ` +
      `or the workflow was not rendered.${suffix}`;
  }
  if(status === 400) {
    return `request rejected (HTTP 400); workflow may be misconfigured.` +
      suffix;
  }
  if(status >= 500) {
    return `server error (HTTP ${status}); workflow may be ` +
      `misconfigured or the service is unhealthy.${suffix}`;
  }
  return `unexpected HTTP ${status}.${suffix}`;
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function takeNext() {
    while(true) {
      const i = nextIndex++;
      if(i >= items.length) {
        return;
      }
      results[i] = await worker(items[i], i);
    }
  }
  const runners = [];
  const parallel = Math.max(1, Math.min(limit, items.length));
  for(let i = 0; i < parallel; i++) {
    runners.push(takeNext());
  }
  await Promise.all(runners);
  return results;
}

function formatLine(status, entry, detail) {
  const base = `[${status}] ${entry.label} ` +
    `(clientId=${entry.clientId ?? '<missing>'}, ` +
    `workflowId=${entry.workflowId ?? '<missing>'})`;
  return detail ? `${base} -> ${detail}` : base;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch(e) {
    console.error(`Error: ${e.message}\n`);
    printUsage();
    process.exit(2);
    return;
  }
  if(args.help) {
    printUsage();
    process.exit(0);
    return;
  }
  if(!args.configPath) {
    console.error('Error: missing path to rendered combined.yaml\n');
    printUsage();
    process.exit(2);
    return;
  }

  let cfg;
  try {
    cfg = loadConfig(args.configPath);
  } catch(e) {
    console.error(`Error: ${e.message}`);
    process.exit(2);
    return;
  }

  let baseUrl;
  try {
    baseUrl = resolveBaseUrl(cfg.parsed, cfg.absolute);
  } catch(e) {
    console.error(`Error: ${e.message}`);
    process.exit(2);
    return;
  }

  let collected;
  try {
    collected = detectVersionAndCollect(cfg.opencred);
  } catch(e) {
    console.error(`Error: ${e.message}`);
    process.exit(2);
    return;
  }

  console.log(`Config: ${cfg.absolute}`);
  console.log(`Detected schema: ${collected.version}`);
  console.log(`Target base URL: ${baseUrl}`);
  console.log(`Workflows found: ${collected.entries.length}`);
  console.log(`Timeout: ${args.timeoutMs}ms, concurrency: ${args.concurrency}`);
  console.log('');

  const toTest = [];
  const skipped = [];
  for(const entry of collected.entries) {
    const skipReason = classifySkip(entry);
    if(skipReason) {
      skipped.push({entry, reason: skipReason});
    } else {
      toTest.push(entry);
    }
  }

  for(const {entry, reason} of skipped) {
    console.log(formatLine('SKIP', entry, reason));
  }

  const results = await runWithConcurrency(
    toTest, args.concurrency, async entry => {
      const result = await attemptExchange({
        baseUrl, entry, timeoutMs: args.timeoutMs
      });
      const label = result.outcome === 'pass' ? 'PASS' : 'FAIL';
      const detail = result.outcome === 'pass' ?
        `HTTP ${result.status} (${result.elapsed}ms)` :
        (result.status !== null ?
          `HTTP ${result.status} (${result.elapsed}ms) - ${result.reason}` :
          `${result.reason}`);
      console.log(formatLine(label, entry, detail));
      return {entry, result};
    });

  const passed = results.filter(r => r.result.outcome === 'pass');
  const failed = results.filter(r => r.result.outcome === 'fail');

  console.log('');
  console.log(
    `Summary: ${passed.length} passed, ${failed.length} failed, ` +
    `${skipped.length} skipped (of ${collected.entries.length} total).`);

  if(failed.length > 0) {
    console.log('');
    console.log('Failed workflows:');
    for(const {entry, result} of failed) {
      const status = result.status !== null ? `HTTP ${result.status}` :
        'no response';
      console.log(
        `  - ${entry.label} (clientId=${entry.clientId}, ` +
        `workflowId=${entry.workflowId}): ${status} - ${result.reason}`);
    }
    process.exit(1);
    return;
  }
  process.exit(0);
}

main().catch(err => {
  console.error(`Unhandled error: ${err?.stack || err?.message || err}`);
  process.exit(2);
});
