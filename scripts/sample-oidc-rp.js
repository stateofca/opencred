/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Minimal OIDC relying party for manual end-to-end OpenCred login testing.
 * Copy this concept in your relying party app to integrate with OpenCred
 * as an OIDC IDP to your RP.
 *
 * Usage:
 *   node scripts/sample-oidc-rp.js --workflow ca-verifier-login
 *     [--port=3000] [--config=./configs/combined.yaml]
 *     [--base-uri=http://127.0.0.1:22080]
 *     [--client-secret=<secret>].
 *
 * Opens http://localhost:{port}/ with a link to OpenCred /login. After wallet
 * presentation, OpenCred redirects to /cb; this script exchanges the code for
 * an id_token and renders decoded claims.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import {parse as parseYaml} from 'yaml';
import path from 'node:path';

const DEFAULT_PORT = 3000;
const DEFAULT_CONFIG = './configs/combined.yaml';
const STATE_TTL_MS = 15 * 60 * 1000;
const UAT_OIDC_WORKFLOW = 'query-mdl-authn-hybrid';

const pendingStates = new Map();

function parseArgs(argv) {
  const args = {
    workflow: null,
    port: DEFAULT_PORT,
    configPath: DEFAULT_CONFIG,
    baseUri: null,
    clientSecret: null,
    clientSecretSource: 'config'
  };
  for(let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if(raw === '--help' || raw === '-h') {
      args.help = true;
      continue;
    }
    if(raw.startsWith('--workflow=')) {
      args.workflow = raw.slice('--workflow='.length);
      continue;
    }
    if(raw === '--workflow') {
      args.workflow = argv[++i];
      if(!args.workflow) {
        throw new Error('Missing value for --workflow');
      }
      continue;
    }
    if(raw.startsWith('--port=')) {
      const n = Number.parseInt(raw.slice('--port='.length), 10);
      if(!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --port value: ${raw}`);
      }
      args.port = n;
      continue;
    }
    if(raw === '--port') {
      const n = Number.parseInt(argv[++i], 10);
      if(!Number.isFinite(n) || n <= 0) {
        throw new Error('Missing or invalid value for --port');
      }
      args.port = n;
      continue;
    }
    if(raw.startsWith('--config=')) {
      args.configPath = raw.slice('--config='.length);
      continue;
    }
    if(raw === '--config') {
      args.configPath = argv[++i];
      if(!args.configPath) {
        throw new Error('Missing value for --config');
      }
      continue;
    }
    if(raw.startsWith('--base-uri=')) {
      args.baseUri = stripTrailingSlash(raw.slice('--base-uri='.length).trim());
      continue;
    }
    if(raw === '--base-uri') {
      const value = argv[++i];
      if(!value) {
        throw new Error('Missing value for --base-uri');
      }
      args.baseUri = stripTrailingSlash(value.trim());
      continue;
    }
    if(raw.startsWith('--client-secret=')) {
      args.clientSecret = raw.slice('--client-secret='.length);
      args.clientSecretSource = 'cli';
      continue;
    }
    if(raw === '--client-secret') {
      args.clientSecret = argv[++i];
      if(!args.clientSecret) {
        throw new Error('Missing value for --client-secret');
      }
      args.clientSecretSource = 'cli';
      continue;
    }
    if(raw.startsWith('-')) {
      throw new Error(`Unknown option: ${raw}`);
    }
    if(args.workflow === null) {
      args.workflow = raw;
      continue;
    }
    throw new Error(`Unexpected positional argument: ${raw}`);
  }
  return args;
}

function printUsage() {
  const msg =
    'Usage: node scripts/sample-oidc-rp.js --workflow=<clientId>\n' +
    '  [--port=3000] [--config=./configs/combined.yaml]\n' +
    '  [--base-uri=<url>] [--client-secret=<secret>]\n\n' +
    'Starts a minimal OIDC RP on http://localhost:{port}/ for manual wallet ' +
    'testing.\nThe workflow oidc.redirectUri in the config must match ' +
    'http://localhost:{port}/cb.';
  console.log(msg);
}

function loadConfig({configPath}) {
  const absolute = path.resolve(configPath);
  const contents = fs.readFileSync(absolute, 'utf8');
  const parsed = parseYaml(contents);
  const opencred = parsed?.app?.opencred;
  if(!opencred || typeof opencred !== 'object') {
    throw new Error(
      `Config is missing \`app.opencred\` section: ${absolute}`);
  }
  const baseUriRaw = parsed?.app?.server?.baseUri;
  if(typeof baseUriRaw !== 'string' || !baseUriRaw.trim()) {
    throw new Error(
      `Config is missing \`app.server.baseUri\`: ${absolute}`);
  }
  return {
    absolute,
    baseUri: stripTrailingSlash(baseUriRaw.trim()),
    workflows: opencred.workflows ?? []
  };
}

function stripTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function findWorkflow({workflows, clientId}) {
  const workflow = workflows.find(w => w.clientId === clientId);
  if(!workflow) {
    throw new Error(`Workflow not found for clientId "${clientId}"`);
  }
  if(!workflow.oidc?.redirectUri) {
    throw new Error(
      `Workflow "${clientId}" has no oidc.redirectUri configured`);
  }
  if(!workflow.clientSecret) {
    throw new Error(
      `Workflow "${clientId}" has no clientSecret configured`);
  }
  return workflow;
}

function buildEffectiveWorkflow({workflow, clientSecret, clientSecretSource}) {
  return {
    ...workflow,
    clientSecret,
    clientSecretSource
  };
}

function rememberState(state) {
  pendingStates.set(state, Date.now());
  pruneExpiredStates();
}

function consumeState(state) {
  if(!state || !pendingStates.has(state)) {
    return false;
  }
  pendingStates.delete(state);
  return true;
}

function pruneExpiredStates() {
  const now = Date.now();
  for(const [state, createdAt] of pendingStates.entries()) {
    if(now - createdAt > STATE_TTL_MS) {
      pendingStates.delete(state);
    }
  }
}

function buildLoginUrl({baseUri, workflow, redirectUri, state}) {
  const params = new URLSearchParams({
    client_id: workflow.clientId,
    redirect_uri: redirectUri,
    scope: 'openid',
    response_type: 'code',
    state
  });
  return `${baseUri}/login?${params.toString()}`;
}

function decodeJwtPayload(token) {
  const parts = token.split('.');
  if(parts.length < 2) {
    throw new Error('Malformed id_token JWT');
  }
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

function basicAuthHeader({clientId, clientSecret}) {
  const token = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return `Basic ${token}`;
}

function parseResponseBody(text) {
  try {
    const payload = JSON.parse(text);
    if(typeof payload !== 'object' || payload === null) {
      return {payload: {value: payload}, parsedJson: true};
    }
    return {payload, parsedJson: true};
  } catch {
    return {payload: null, parsedJson: false};
  }
}

function formatCodePrefix(code) {
  if(!code) {
    return '(none)';
  }
  if(code.length <= 8) {
    return code;
  }
  return `${code.slice(0, 8)}…`;
}

function httpStatusText(status) {
  const labels = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error'
  };
  return labels[status] ?? '';
}

function summarizeTokenFailure({status, payload, rawBody}) {
  const parts = [];
  if(payload?.message) {
    parts.push(String(payload.message));
  }
  if(payload?.error) {
    parts.push(String(payload.error));
  }
  if(payload?.error_description) {
    parts.push(String(payload.error_description));
  }
  if(parts.length > 0) {
    return parts.join(' — ');
  }
  if(!payload && rawBody) {
    return rawBody.slice(0, 200);
  }
  return `HTTP ${status}`;
}

function isCredentialResolutionFailure({status, payload, rawBody}) {
  if(status !== 401) {
    return false;
  }
  const haystack = [
    payload?.message,
    payload?.error_description,
    payload?.error,
    rawBody
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes('client id could not be resolved') ||
    haystack.includes('invalid clientid') ||
    haystack.includes('invalid client secret') ||
    haystack.includes('malformed token or invalid clientid');
}

async function exchangeCodeForToken({
  baseUri, workflow, code, redirectUri
}) {
  const tokenUrl = `${baseUri}/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: 'openid'
  });
  const requestContext = {
    tokenUrl,
    clientId: workflow.clientId,
    authMethod: 'client_secret_basic',
    grantType: 'authorization_code',
    codePrefix: formatCodePrefix(code)
  };

  let response;
  let text;
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader({
          clientId: workflow.clientId,
          clientSecret: workflow.clientSecret
        }),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
    text = await response.text();
  } catch(err) {
    throw new Error(
      `Token exchange network error for ${tokenUrl}: ${err.message}`);
  }

  const {payload, parsedJson} = parseResponseBody(text);
  const failurePayload = parsedJson ? payload : {raw: text};

  if(!response.ok) {
    return {
      ok: false,
      status: response.status,
      statusText: httpStatusText(response.status),
      payload: failurePayload,
      rawBody: text,
      parsedJson,
      ...requestContext
    };
  }

  if(!payload?.id_token) {
    return {
      ok: false,
      status: response.status,
      statusText: httpStatusText(response.status),
      payload: failurePayload ?? {message: 'Token response missing id_token'},
      rawBody: text,
      parsedJson,
      ...requestContext
    };
  }

  return {
    ok: true,
    status: response.status,
    payload,
    idToken: payload.id_token,
    ...requestContext
  };
}

function logTokenExchangeFailure(result) {
  const summary = summarizeTokenFailure(result);
  console.error(
    `Token exchange failed: HTTP ${result.status}` +
    `${result.statusText ? ` ${result.statusText}` : ''} — ${summary}`
  );
  if(result.payload) {
    console.error('Token exchange response payload:');
    console.error(JSON.stringify(result.payload, null, 2));
  } else if(result.rawBody) {
    console.error('Token exchange raw response body:');
    console.error(result.rawBody);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatClaimValue(value) {
  if(value === null || value === undefined) {
    return '';
  }
  if(typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function isDocumentNumberClaim(name) {
  return String(name).toLowerCase().includes('document_number');
}

function renderPage({title, bodyHtml}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      line-height: 1.5;
      margin: 2rem auto;
      max-width: 960px;
      padding: 0 1rem;
    }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.15rem; margin-top: 1.5rem; }
    a.button {
      background: #0b5cab;
      border-radius: 4px;
      color: #fff;
      display: inline-block;
      padding: 0.75rem 1rem;
      text-decoration: none;
    }
    table {
      border-collapse: collapse;
      margin-top: 0.5rem;
      width: 100%;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 0.5rem;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f5f5f5; width: 12rem; }
    tr.highlight { background: #fff8dc; }
    pre {
      background: #f5f5f5;
      overflow-x: auto;
      padding: 1rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .error { color: #a40000; }
    .meta { color: #555; font-size: 0.95rem; }
    .hint {
      background: #fff8dc;
      border: 1px solid #e6d98a;
      padding: 1rem;
    }
    ul { margin: 0.5rem 0 0 1.25rem; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function renderHomePage({workflow, loginUrl, redirectUri, baseUri}) {
  const bodyHtml = `
  <h1>OpenCred OIDC Test RP</h1>
  <p class="meta">
    Workflow: <strong>${escapeHtml(workflow.clientId)}</strong><br>
    OpenCred: <strong>${escapeHtml(baseUri)}</strong><br>
    Redirect URI: <strong>${escapeHtml(redirectUri)}</strong>
  </p>
  <p><a class="button" href="${escapeHtml(loginUrl)}">Sign in with mDL</a></p>
  <p class="meta">After wallet presentation, OpenCred redirects back here
    with an authorization code.</p>`;
  return renderPage({title: 'OpenCred OIDC Test RP', bodyHtml});
}

function renderErrorPage({title, message, details}) {
  const detailHtml = details ?
    `<pre>${escapeHtml(details)}</pre>` : '';
  const bodyHtml = `
  <h1 class="error">${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  ${detailHtml}
  <p><a href="/">Back</a></p>`;
  return renderPage({title, bodyHtml});
}

function renderOAuthFields({payload}) {
  if(!payload || typeof payload !== 'object') {
    return '';
  }
  const fields = [
    ['message', payload.message],
    ['error', payload.error],
    ['error_description', payload.error_description]
  ].filter(([, value]) => value !== undefined && value !== null &&
    value !== '');

  if(fields.length === 0) {
    return '';
  }

  const rows = fields.map(([name, value]) => {
    let display = String(value);
    if(typeof value === 'string') {
      try {
        const nested = JSON.parse(value);
        if(typeof nested === 'object' && nested !== null) {
          display = JSON.stringify(nested, null, 2);
        }
      } catch {
        // keep plain string
      }
    }
    return `<tr><th>${escapeHtml(name)}</th>` +
      `<td><pre>${escapeHtml(display)}</pre></td></tr>`;
  }).join('\n');

  return `
  <h2>Server message</h2>
  <table>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderCredentialHint({status, payload, rawBody}) {
  if(!isCredentialResolutionFailure({status, payload, rawBody})) {
    return '';
  }

  return `
  <h2>Likely cause</h2>
  <div class="hint">
    <p>OpenCred rejected the token request before exchanging the code.</p>
    <ul>
      <li>Exchange the code at the same base URI that issued it.</li>
      <li><code>client_id</code> and <code>client_secret</code> must match ` +
        `that server's deployed workflow config.</li>
      <li>For local dev, try <code>--base-uri http://127.0.0.1:22080</code> ` +
        `with a local workflow such as <code>ca-verifier-login</code>.</li>
      <li>For UAT, try <code>--workflow ${escapeHtml(UAT_OIDC_WORKFLOW)}` +
        `</code> and <code>--client-secret</code> from secrets manager.</li>
    </ul>
  </div>`;
}

function renderTokenExchangeErrorPage({result, baseUri, workflow}) {
  const statusLabel = result.statusText ?
    `HTTP ${result.status} ${result.statusText}` :
    `HTTP ${result.status}`;
  const parsedBody = result.parsedJson && result.payload ?
    JSON.stringify(result.payload, null, 2) :
    '(response was not JSON)';
  const hintHtml = isCredentialResolutionFailure(result) ?
    renderCredentialHint({baseUri, workflow, ...result}) : '';

  const bodyHtml = `
  <h1 class="error">Token exchange failed (${escapeHtml(statusLabel)})</h1>
  <p>${escapeHtml(summarizeTokenFailure(result))}</p>
  ${renderOAuthFields({payload: result.payload})}
  ${hintHtml}
  <h2>Request context</h2>
  <table>
    <tbody>
      <tr><th>Method</th><td>POST</td></tr>
      <tr><th>URL</th><td>${escapeHtml(result.tokenUrl)}</td></tr>
      <tr><th>client_id</th><td>${escapeHtml(result.clientId)}</td></tr>
      <tr><th>Auth method</th><td>${escapeHtml(result.authMethod)}</td></tr>
      <tr><th>grant_type</th><td>${escapeHtml(result.grantType)}</td></tr>
      <tr><th>code</th><td>${escapeHtml(result.codePrefix)}</td></tr>
      <tr><th>client_secret source</th>` +
        `<td>${escapeHtml(workflow.clientSecretSource ?? 'config')}</td></tr>
    </tbody>
  </table>
  <h2>Raw response (parsed)</h2>
  <pre>${escapeHtml(parsedBody)}</pre>
  <h2>Raw response body (verbatim)</h2>
  <pre>${escapeHtml(result.rawBody ?? '')}</pre>
  <p><a href="/">Back</a></p>`;

  return renderPage({title: 'Token Exchange Failed', bodyHtml});
}

function renderClaimsPage({
  workflow, claims, idToken, tokenResponse, returnedState
}) {
  const rows = Object.entries(claims)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => {
      const highlight = isDocumentNumberClaim(name) ? ' class="highlight"' : '';
      return `<tr${highlight}>` +
        `<th>${escapeHtml(name)}</th>` +
        `<td><pre>${escapeHtml(formatClaimValue(value))}</pre></td>` +
        `</tr>`;
    })
    .join('\n');

  const bodyHtml = `
  <h1>OIDC Login Result</h1>
  <p class="meta">
    Workflow: <strong>${escapeHtml(workflow.clientId)}</strong><br>
    State: <strong>${escapeHtml(returnedState ?? '(none)')}</strong>
  </p>
  <h2>id_token claims</h2>
  <table>
    <thead>
      <tr><th>Claim</th><th>Value</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <h2>Raw id_token</h2>
  <pre>${escapeHtml(idToken)}</pre>
  <h2>Token response</h2>
  <pre>${escapeHtml(JSON.stringify(tokenResponse, null, 2))}</pre>
  <p><a href="/">Start over</a></p>`;
  return renderPage({title: 'OIDC Login Result', bodyHtml});
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(html);
}

function warnRedirectUriMismatch({workflow, redirectUri, configPath}) {
  const configured = workflow.oidc.redirectUri;
  if(configured === redirectUri) {
    return;
  }
  console.warn('');
  console.warn(
    `Warning: workflow "${workflow.clientId}" redirectUri in ` +
    `${configPath} is:`);
  console.warn(`  ${configured}`);
  console.warn('This RP is listening at:');
  console.warn(`  ${redirectUri}`);
  console.warn(
    'Update combined.yaml and restart opencred-platform before testing.');
  console.warn('');
}

function warnRemoteLocalClientId({baseUri, workflow}) {
  const isRemote = !baseUri.includes('localhost') &&
    !baseUri.includes('127.0.0.1');
  if(!isRemote) {
    return;
  }
  console.warn('');
  console.warn(
    `Warning: workflow "${workflow.clientId}" is a local-dev clientId, ` +
    `but OpenCred base URI is remote:`);
  console.warn(`  ${baseUri}`);
  console.warn(
    `UAT's equivalent OIDC hybrid workflow is "${UAT_OIDC_WORKFLOW}" ` +
    `with a Terraform-generated clientSecret.`);
  console.warn(
    'Use --workflow query-mdl-authn-hybrid and --client-secret for UAT, ' +
    'or --base-uri http://127.0.0.1:22080 for local end-to-end testing.');
  console.warn('');
}

async function handleCallback({url, baseUri, workflow, redirectUri}) {
  const error = url.searchParams.get('error');
  if(error) {
    const description = url.searchParams.get('error_description') ?? '';
    return renderErrorPage({
      title: 'Authorization Error',
      message: `${error}${description ? `: ${description}` : ''}`
    });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if(!code) {
    return renderErrorPage({
      title: 'Missing Authorization Code',
      message: 'Expected ?code=... on the callback URL.'
    });
  }
  if(!consumeState(state)) {
    return renderErrorPage({
      title: 'Invalid State',
      message: 'The returned state did not match a pending login request.',
      details: `state=${state ?? '(missing)'}`
    });
  }

  try {
    const result = await exchangeCodeForToken({
      baseUri, workflow, code, redirectUri
    });
    if(!result.ok) {
      logTokenExchangeFailure(result);
      return renderTokenExchangeErrorPage({result, baseUri, workflow});
    }
    const claims = decodeJwtPayload(result.idToken);
    return renderClaimsPage({
      workflow,
      claims,
      idToken: result.idToken,
      tokenResponse: result.payload,
      returnedState: state
    });
  } catch(err) {
    return renderErrorPage({
      title: 'Token Exchange Failed',
      message: err.message
    });
  }
}

function createRpServer({baseUri, workflow, redirectUri}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://127.0.0.1`);
      if(req.method !== 'GET') {
        sendHtml(res, 405, renderErrorPage({
          title: 'Method Not Allowed',
          message: 'Only GET is supported.'
        }));
        return;
      }

      if(url.pathname === '/') {
        const state = crypto.randomBytes(16).toString('hex');
        rememberState(state);
        const loginUrl = buildLoginUrl({
          baseUri, workflow, redirectUri, state
        });
        sendHtml(res, 200, renderHomePage({
          workflow, loginUrl, redirectUri, baseUri
        }));
        return;
      }

      if(url.pathname === '/cb') {
        const html = await handleCallback({
          url, baseUri, workflow, redirectUri
        });
        sendHtml(res, 200, html);
        return;
      }

      sendHtml(res, 404, renderErrorPage({
        title: 'Not Found',
        message: `Unknown path: ${url.pathname}`
      }));
    } catch(err) {
      sendHtml(res, 500, renderErrorPage({
        title: 'Server Error',
        message: err.message
      }));
    }
  });
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch(err) {
    console.error(`Error: ${err.message}\n`);
    printUsage();
    process.exit(2);
    return;
  }

  if(args.help) {
    printUsage();
    process.exit(0);
    return;
  }

  if(!args.workflow) {
    console.error('Error: --workflow=<clientId> is required\n');
    printUsage();
    process.exit(2);
    return;
  }

  let config;
  try {
    config = loadConfig({configPath: args.configPath});
  } catch(err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
    return;
  }

  let workflowTemplate;
  try {
    workflowTemplate = findWorkflow({
      workflows: config.workflows,
      clientId: args.workflow
    });
  } catch(err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
    return;
  }

  const baseUri = args.baseUri ?? config.baseUri;
  const clientSecret = args.clientSecret ?? workflowTemplate.clientSecret;
  const workflow = buildEffectiveWorkflow({
    workflow: workflowTemplate,
    clientSecret,
    clientSecretSource: args.clientSecretSource
  });

  const redirectUri = `http://localhost:${args.port}/cb`;
  warnRedirectUriMismatch({
    workflow,
    redirectUri,
    configPath: config.absolute
  });
  warnRemoteLocalClientId({baseUri, workflow});

  const server = createRpServer({
    baseUri,
    workflow,
    redirectUri
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(args.port, '127.0.0.1', resolve);
  });

  console.log(`Config: ${config.absolute}`);
  console.log(`Workflow: ${workflow.clientId}`);
  console.log(`OpenCred base URI: ${baseUri}` +
    `${args.baseUri ? ' (CLI override)' : ''}`);
  console.log(
    `Client secret source: ${workflow.clientSecretSource}`
  );
  console.log(`Redirect URI: ${redirectUri}`);
  console.log(`Open http://localhost:${args.port}/ in your browser.`);
}

main().catch(err => {
  console.error(`Unhandled error: ${err?.stack || err?.message || err}`);
  process.exit(2);
});
