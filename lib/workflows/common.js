import {importPKCS8, importSPKI, jwtVerify, SignJWT} from 'jose';
import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {domainToDidWeb} from '../didWeb.js';
import {isDcApiAvailable} from '../../common/dcapi.js';
import {logger} from '../logger.js';
import QRCode from 'qrcode';

/**
 * Resolves which protocol URL to use for QR code generation based on query
 * parameters and exchange data.
 *
 * @param {object} query - Request query parameters.
 * @param {object} exchangeData - Formatted exchange data with protocols.
 * @returns {{protocolKey: string, url: string}|null} Protocol key and URL,
 *   or null if no QR should be included.
 */
export function resolveQrProtocol(query, exchangeData) {
  // qr=false explicitly disables QR
  if(query.qr === 'false') {
    return null;
  }

  // If qr is set and is not 'true' or 'false', treat it as a protocol name
  if(query.qr && query.qr !== '' && query.qr !== 'true' &&
    query.qr !== 'false') {
    const protocolKey = query.qr;
    // Try protocols object first, then top-level exchangeData fields
    const url = exchangeData.protocols?.[protocolKey] ||
      exchangeData[protocolKey];
    if(url && typeof url === 'string') {
      return {protocolKey, url};
    }
    // Invalid/unsupported protocol - return null
    return null;
  }

  // Legacy behavior: use qr param or includeQRByDefault
  if(exchangeData.OID4VP && (query.qr === 'true' ||
    (query.qr !== 'false' &&
      config.opencred.options.includeQRByDefault))) {
    return {protocolKey: 'OID4VP', url: exchangeData.OID4VP};
  }

  return null;
}

/**
 * Builds the context object for an exchange. Used by newExchangeContext and
 * continuationContext.
 *
 * @param {object} exchange - Formatted exchange (with OID4VP, etc.).
 * @param {object} workflow - Workflow config.
 * @param {object} [query] - Request query (for qr param).
 * @returns {Promise<object>} Context object.
 */
export async function buildNewExchangeContextData(
  exchange, workflow, query = {}) {
  const qrResult = resolveQrProtocol(query, exchange);

  const exchangeData = {
    ...exchange,
    ...(qrResult ? {
      QR: await QRCode.toDataURL(qrResult.url)
    } : {})
  };

  const dcApiEnabled = isDcApiAvailable(config.opencred) &&
    (workflow.dcApiEnabled !== undefined ?
      workflow.dcApiEnabled === true :
      config.opencred.options.dcApiEnabled === true);

  const options = {
    ...config.opencred.options,
    dcApiEnabled,
    wallets: workflow.wallets ?? config.opencred.options.wallets
  };

  return {
    step: 'default',
    workflow: {
      clientId: workflow.clientId,
      redirectUri: workflow.redirectUri,
      name: workflow.name,
      brand: workflow.brand,
      type: workflow.type,
      query: workflow.query
    },
    options,
    exchangeData
  };
}

/**
 * Scrubs credential data from exchange for partial scope (exchange:partial).
 * Removes verifiablePresentation and vpToken from each result step but
 * preserves errors.
 *
 * @param {object} exchange - The exchange object.
 * @returns {object} A copy of the exchange with credential data scrubbed.
 */
export function scrubExchangeForPartialScope(exchange) {
  if(!exchange?.variables?.results) {
    return exchange;
  }
  const scrubbed = {...exchange};
  scrubbed.variables = {...exchange.variables};
  scrubbed.variables.results = {};
  for(const [step, result] of Object.entries(exchange.variables.results)) {
    scrubbed.variables.results[step] = {};
    if(Array.isArray(result.errors)) {
      scrubbed.variables.results[step].errors = result.errors;
    }
  }
  return scrubbed;
}

export const newExchangeContext = async (req, res) => {
  if(!req.exchange) {
    res.status(404).send('Exchange not found');
    return;
  }
  try {
    const context = await buildNewExchangeContextData(
      req.exchange, req.workflow, req.query);
    res.send(context);
    return;
  } catch(error) {
    logger.error(error.message, {error});
    res.status(500).send('Error rendering page');
    return;
  }
};

/**
 * Handles a verified presentation by creating an updated exchange.
 *
 * @param {object} options - Options for handling verified presentation.
 * @param {object} options.exchange - The current exchange.
 * @param {object} options.verifiablePresentation - The verified presentation.
 * @param {string|object} options.vpToken - The VP token.
 * @returns {Promise<object>} The updated exchange object.
 */
export async function handleVerifiedPresentation({
  exchange,
  verifiablePresentation,
  vpToken
}) {
  const updatedExchange = {
    ...exchange,
    sequence: exchange.sequence + 1,
    updatedAt: new Date(),
    state: 'complete',
    oidc: {
      code: await createId(),
      state: exchange.oidc?.state
    },
    variables: {
      ...(exchange.variables ?? {}),
      results: {
        [exchange.step]: {
          verifiablePresentation,
          vpToken
        }
      }
    }
  };
  return updatedExchange;
}

/**
 * Builds a signed JWT that serves as a capability token for viewing exchange
 * results. Used in the redirect_uri returned to the wallet after presentation.
 *
 * @param {object} options - Options for building the token.
 * @param {string} options.exchangeId - The exchange ID.
 * @param {string} options.workflowId - The workflow ID.
 * @param {string} options.procedurePath - The procedure path ('login' or
 *   'verification').
 * @param {string} [options.scope] - Optional scope (e.g. 'exchange:partial')
 *   for limited permissions.
 * @returns {Promise<string>} The signed JWT.
 */
export async function buildExchangeResultToken({
  exchangeId,
  workflowId,
  procedurePath,
  scope
}) {
  const signingKey = config.opencred.signingKeys
    .find(k => k.purpose?.includes('id_token'));
  if(!signingKey) {
    throw new Error('No signing key with id_token purpose found');
  }
  const ttlSeconds = config.opencred?.options?.exchangeTtlSeconds ?? 900;
  const privateKey = await importPKCS8(
    signingKey.privateKeyPem, signingKey.type);
  const baseUri = config.server?.baseUri || 'https://example.com';
  const kid = `${domainToDidWeb(baseUri)}#${signingKey.id}`;
  const payload = {
    exchangeId,
    workflowId,
    procedurePath
  };
  if(scope) {
    payload.scope = scope;
  }
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({
      alg: signingKey.type,
      kid,
      typ: 'JWT'
    })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(privateKey);
  return jwt;
}

/**
 * Verifies an exchange result token and returns the payload.
 *
 * @param {string} token - The JWT to verify.
 * @returns {Promise<{exchangeId: string, workflowId: string,
 *   procedurePath: string, scope?: string}>} The decoded payload.
 * @throws {Error} If the token is invalid or expired.
 */
export async function verifyExchangeResultToken(token) {
  const signingKey = config.opencred.signingKeys
    .find(k => k.purpose?.includes('id_token'));
  if(!signingKey) {
    throw new Error('No signing key with id_token purpose found');
  }
  const publicKey = await importSPKI(
    signingKey.publicKeyPem, signingKey.type);
  const {payload} = await jwtVerify(token, publicKey);
  const {exchangeId, workflowId, procedurePath, scope} = payload;
  if(!exchangeId || !workflowId || !procedurePath) {
    throw new Error('Invalid exchange result token: missing required claims');
  }
  const result = {exchangeId, workflowId, procedurePath};
  if(scope) {
    result.scope = scope;
  }
  return result;
}
