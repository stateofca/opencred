import {importPKCS8, importSPKI, jwtVerify, SignJWT} from 'jose';
import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {domainToDidWeb} from '../didWeb.js';
import {isDcApiAvailable} from '../../common/dcapi.js';
import {logger} from '../logger.js';
import QRCode from 'qrcode';

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
  const includeQR = exchange.OID4VP && (query.qr === 'true' ||
    (query.qr !== 'false' && config.opencred.options.includeQRByDefault));

  const exchangeData = {
    ...exchange,
    ...(includeQR ? {QR: await QRCode.toDataURL(exchange.OID4VP)} : {})
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

const EXCHANGE_RESULT_TOKEN_EXPIRY = '10m';

/**
 * Builds a signed JWT that serves as a capability token for viewing exchange
 * results. Used in the redirect_uri returned to the wallet after presentation.
 *
 * @param {object} options - Options for building the token.
 * @param {string} options.exchangeId - The exchange ID.
 * @param {string} options.workflowId - The workflow ID.
 * @param {string} options.procedurePath - The procedure path ('login' or
 *   'verification').
 * @returns {Promise<string>} The signed JWT.
 */
export async function buildExchangeResultToken({
  exchangeId,
  workflowId,
  procedurePath
}) {
  const signingKey = config.opencred.signingKeys
    .find(k => k.purpose?.includes('id_token'));
  if(!signingKey) {
    throw new Error('No signing key with id_token purpose found');
  }
  const privateKey = await importPKCS8(
    signingKey.privateKeyPem, signingKey.type);
  const baseUri = config.server?.baseUri || 'https://example.com';
  const kid = `${domainToDidWeb(baseUri)}#${signingKey.id}`;
  const jwt = await new SignJWT({
    exchangeId,
    workflowId,
    procedurePath
  })
    .setProtectedHeader({
      alg: signingKey.type,
      kid,
      typ: 'JWT'
    })
    .setIssuedAt()
    .setExpirationTime(EXCHANGE_RESULT_TOKEN_EXPIRY)
    .sign(privateKey);
  return jwt;
}

/**
 * Verifies an exchange result token and returns the payload.
 *
 * @param {string} token - The JWT to verify.
 * @returns {Promise<{exchangeId: string, workflowId: string,
 *   procedurePath: string}>} The decoded payload.
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
  const {exchangeId, workflowId, procedurePath} = payload;
  if(!exchangeId || !workflowId || !procedurePath) {
    throw new Error('Invalid exchange result token: missing required claims');
  }
  return {exchangeId, workflowId, procedurePath};
}
