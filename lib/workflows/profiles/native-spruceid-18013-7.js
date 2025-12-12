/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DcApi, JsOid4VpSessionStore} from '@spruceid/opencred-dc-api';
import {config} from '@bedrock/core';
import {createId} from '../../../common/utils.js';
import {decodeJwt} from 'jose';
import {isDcApiAvailable} from '../../../common/dcapi.js';
import {klona} from 'klona';
import {logger} from '../../logger.js';

/**
 * Normalize PEM string to strict format required by Rust PEM parser.
 * The DC API library (Rust/WASM) uses a strict PEM parser that requires:
 * - No content after the end boundary
 * - No trailing whitespace on base64 lines
 * - Consistent line endings (LF)
 * - Proper newline after end boundary (some parsers require this)
 * @param {string} pemString - The PEM string to normalize
 * @returns {string} Normalized PEM string
 */
function normalizePem(pemString) {
  if(!pemString) {
    throw new Error('PEM string is empty');
  }

  // Normalize line endings to LF and trim leading/trailing whitespace
  const normalized = pemString.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .trim();

  // Find the begin and end boundaries
  const beginMatch = normalized.match(/-----BEGIN [A-Z ]+-----\n?/);
  const endBoundaryMatch = normalized.match(/-----END [A-Z ]+-----/);

  if(!beginMatch) {
    throw new Error('Invalid PEM format: no begin boundary found');
  }
  if(!endBoundaryMatch) {
    throw new Error('Invalid PEM format: no end boundary found');
  }

  // Extract everything up to and including the END boundary
  const endIndex = endBoundaryMatch.index + endBoundaryMatch[0].length;
  const cleaned = normalized.substring(0, endIndex);

  // Clean up base64 content: remove trailing whitespace from each line
  // but preserve the original newline structure
  const lines = cleaned.split('\n');
  const cleanedLines = lines.map(line => {
    // Don't trim boundary lines, only base64 content lines
    if(line.startsWith('-----BEGIN') || line.startsWith('-----END')) {
      return line;
    }
    // Trim trailing whitespace from base64 lines
    return line.trimEnd();
  });

  // Ensure there's a newline before END PRIVATE KEY if missing
  let result = cleanedLines.join('\n');

  // Check if END boundary is on the same line as the last base64 content
  // If so, we need to add a newline before it
  if(!result.match(/[^\n]\n-----END/)) {
    // No newline before END, add one
    result = result.replace(/([^\n])(-----END)/, '$1\n$2');
  }

  // Ensure trailing newline after END boundary (many parsers expect this)
  if(!result.endsWith('\n')) {
    result += '\n';
  }

  return result;
}

/**
 * Create unified session stores with shared in-memory exchange and dirty flag
 * @param {Object} params - Parameters
 * @param {Object} params.exchange - The exchange object to use
 * @returns {Object} Object containing session stores, dirty flag,
 *   and updated exchange
 */
function createSessionStores({exchange}) {
  const updatedExchange = klona(exchange);
  let dirty = false;

  if(!updatedExchange.variables) {
    updatedExchange.variables = {};
  }

  const oid4vpSessionStoreImpl = {
    async initiate(session) {
      try {
        // Use exchange.id as the session identifier
        // Map session.id/uuid to exchange.id if needed
        if(!updatedExchange.variables.oid4vpSession) {
          updatedExchange.variables.oid4vpSession = {};
        }
        // Store the session, ensuring uuid matches exchange.id if possible
        const sessionToStore = {
          ...session,
          uuid: session.uuid || exchange.id,
          id: session.id || exchange.id
        };
        updatedExchange.variables.oid4vpSession = sessionToStore;
        dirty = true;
      } catch(e) {
        logger.error('Failed to store OID4VP session:', e);
      }
    },
    async updateStatus(uuid, status) {
      // Use exchange.id for lookup if uuid matches exchange.id
      const lookupUuid = (uuid === exchange.id) ? exchange.id : uuid;

      if(updatedExchange.variables?.oid4vpSession?.uuid === lookupUuid ||
         updatedExchange.variables?.oid4vpSession?.id === lookupUuid) {
        updatedExchange.variables.oid4vpSession.status = status;
        dirty = true;
      }
    },
    async getSession(uuid) {
      // Use exchange.id for lookup if uuid matches exchange.id
      const lookupUuid = (uuid === exchange.id) ? exchange.id : uuid;

      const session = updatedExchange.variables?.oid4vpSession;
      if(!session ||
         (session.uuid !== lookupUuid && session.id !== lookupUuid)) {
        throw new Error(`OID4VP Session not found for UUID: ${uuid}`);
      }

      return session;
    },
    async removeSession(uuid) {
      // Use exchange.id for lookup if uuid matches exchange.id
      const lookupUuid = (uuid === exchange.id) ? exchange.id : uuid;

      const session = updatedExchange.variables?.oid4vpSession;
      if(session &&
         (session.uuid === lookupUuid || session.id === lookupUuid)) {
        delete updatedExchange.variables.oid4vpSession;
        dirty = true;
      }
    },
  };

  const oid4vpSessionStore = new JsOid4VpSessionStore(oid4vpSessionStoreImpl);

  const dcapiSessionStore = {
    newSession: async (sessionId, session) => {
      if(!updatedExchange.variables.dcApiSession) {
        updatedExchange.variables.dcApiSession = {};
      }
      if(!updatedExchange.variables.dcApiSession.session_creation_response) {
        updatedExchange.variables.dcApiSession.session_creation_response = {
          id: sessionId
        };
      }
      updatedExchange.variables.dcApiSession.session = session;
      dirty = true;
    },
    getSession: async (id /*, clientSecret*/) => {
      const sessionId =
        updatedExchange.variables?.dcApiSession?.session_creation_response?.id;
      if(sessionId === id) {
        return updatedExchange.variables?.dcApiSession?.session || null;
      }
      return null;
    },
    getSessionUnauthenticated: async id => {
      const sessionId =
        updatedExchange.variables?.dcApiSession?.session_creation_response?.id;
      if(sessionId === id) {
        return updatedExchange.variables?.dcApiSession?.session || null;
      }
      return null;
    },
    updateSession: async (sessionId, session) => {
      const storedSessionId =
        updatedExchange.variables?.dcApiSession?.session_creation_response?.id;
      if(storedSessionId === sessionId) {
        updatedExchange.variables.dcApiSession.session = session;
        dirty = true;
      }
    },
    removeSession: async sessionId => {
      const storedSessionId =
        updatedExchange.variables?.dcApiSession?.session_creation_response?.id;
      if(storedSessionId === sessionId) {
        delete updatedExchange.variables.dcApiSession;
        dirty = true;
      }
    },
  };

  return {
    oid4vpSessionStore, // WASM-wrapped for production use
    oid4vpSessionStoreImpl, // Raw implementation for testing
    dcapiSessionStore,
    get dirty() {
      return dirty;
    },
    updatedExchange
  };
}

/**
 * Create DC API instance with exchange-specific session stores
 * @param {Object} exchange - The exchange object
 * @param {string} responseUrl - The response URL for the DC API instance
 * @returns {Promise<Object>} Object containing dcApi instance, dirty flag,
 *   and updatedExchange
 */
async function createDcApiInstance(exchange, responseUrl) {
  if(!isDcApiAvailable(config.opencred)) {
    throw new Error(
      'DC API cannot be initialized: certificate is not configured. ' +
      'DC API requires a signing key with purpose authorization_request that ' +
      'has certificatePem configured.'
    );
  }

  const sk = config.opencred.signingKeys.find(k =>
    k.purpose?.includes('authorization_request')
  );

  if(!sk) {
    throw new Error('No signing key with purpose authorization_request found');
  }

  if(!sk.certificatePem) {
    throw new Error(
      'Signing key certificatePem is not configured. ' +
      'DC API requires certificatePem to be set on the signing key.'
    );
  }

  const encoder = new TextEncoder();
  const baseUrl = config.server.baseUri;
  const submissionEndpoint = responseUrl || `${baseUrl}/workflows/` +
    ':workflowId/exchanges/:exchangeId/openid/client/authorization/response';
  const referenceEndpoint = '';

  // Normalize PEM to remove any trailing content after the end boundary
  // The DC API library's Rust PEM parser is strict and rejects such content
  const normalizedPrivateKeyPem = normalizePem(sk.privateKeyPem);

  // Extract the first certificate from certificatePem if it's a chain
  let certificatePem = sk.certificatePem;
  const certMatches = sk.certificatePem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/
  );
  if(certMatches && certMatches.length > 0) {
    certificatePem = certMatches[0];
  }

  // Create session stores with shared state
  const {oid4vpSessionStore, dcapiSessionStore, dirty, updatedExchange} =
    createSessionStores({exchange});

  const dcApi = await DcApi.new(
    normalizedPrivateKeyPem,
    baseUrl,
    submissionEndpoint,
    referenceEndpoint,
    encoder.encode(certificatePem),
    oid4vpSessionStore,
    dcapiSessionStore
  );

  return {
    dcApi,
    dirty,
    updatedExchange
  };
}

/**
 * Create or get DC API session for an exchange
 * @param {Object} exchange - The exchange object
 * @param {string} responseUrl - The response URL for the DC API instance
 * @returns {Promise<Object>} Object containing dcApiSession and instance info
 */
async function getOrCreateDcApiSession(exchange, responseUrl) {
  if(exchange.variables?.dcApiSession?.session_creation_response) {
    return {
      dcApiSession: exchange.variables.dcApiSession,
      instance: null // No instance needed if session already exists
    };
  }

  const instance = await createDcApiInstance(exchange, responseUrl);
  const dcApiSession = await instance.dcApi.create_new_session();

  // Store the complete dcApiSession including client_secret in the exchange
  // variables. This will be persisted to the database before a redacted copy
  // is returned to the client.
  instance.updatedExchange.variables.dcApiSession = dcApiSession;

  return {
    dcApiSession,
    instance
  };
}

/**
 * Generate authorization request for 18013-7-Annex-D-spruceid profile
 * Uses SpruceID DC API library with dcApiNamespaceQuery from workflow level
 * @param {Object} options - Options object
 * @param {Object} options.workflow - The workflow configuration
 * @param {Object} options.exchange - The exchange object
 * @param {string} options.requestUrl - The original request URL
 * @param {string} [options.userAgent] - The user agent string (optional)
 * @param {string} [options.baseUri] - Base URI (optional, derived from requestUrl if not provided)
 * @param {Array} [options.signingKeys] - Signing keys array (optional)
 * @param {string} options.profile - OID4VP profile identifier
 *   (should be '18013-7-Annex-D-spruceid')
 * @param {string} options.responseMode - Response mode
 * @returns {Promise<Object>} Object containing requests (JWT array) and
 *   updatedExchange
 */
export async function generateAuthorizationRequest({
  workflow,
  exchange,
  requestUrl,
  userAgent = '',
  baseUri,
  signingKeys,
  profile,
  responseMode
}) {
  // Use passed baseUri (which is config.server.baseUri) for server identity
  // This ensures client_id always represents the canonical server identity
  const serverBaseUri = baseUri || config.server.baseUri;

  // Check if DC API is available at system level
  if(!isDcApiAvailable(config.opencred)) {
    const error = new Error(
      'DC API is not available: signing key certificate is not configured'
    );
    error.statusCode = 503;
    error.errorCode = 'DC_API_UNAVAILABLE';
    throw error;
  }

  // Check if DC API is enabled at workflow level
  if(workflow?.dcApiEnabled === false) {
    const error = new Error(
      'DC API is not available for this workflow'
    );
    error.statusCode = 403;
    error.errorCode = 'DC_API_DISABLED';
    throw error;
  }

  // Build response URL
  const responseUrl = `${serverBaseUri}${
    requestUrl.replace('request', 'response')}`;

  // Get or create DC API session
  const {dcApiSession, instance: sessionInstance} =
    await getOrCreateDcApiSession(exchange, responseUrl);
  const sessionId =
    dcApiSession.session_creation_response.id;
  const sessionSecret =
    dcApiSession.session_creation_response.client_secret;

  if(!sessionSecret || !sessionId) {
    throw new Error('Session data missing from exchange');
  }

  // Extract dcApiNamespaceQuery from workflow level (moved from query items)
  const dcApiNamespaceQuery = workflow?.dcApiNamespaceQuery;

  if(!dcApiNamespaceQuery) {
    throw new Error(
      'dcApiNamespaceQuery is required for ' +
      '18013-7-Annex-D-spruceid requests. ' +
      'It must be specified at the RP level.'
    );
  }

  const origin = serverBaseUri;
  const dcApiNamespaceRequest = {
    namespaces: dcApiNamespaceQuery,
    origin
  };

  // Create DcApi instance with exchange-specific session stores
  const exchangeToUse = sessionInstance?.updatedExchange || exchange;
  const {dcApi, updatedExchange} =
    await createDcApiInstance(exchangeToUse, responseUrl);

  // Generate DC API dcql_query-based request
  // This returns {requests: [jwtstring]}
  const {requests} = await dcApi.initiate_request(
    sessionId,
    sessionSecret,
    dcApiNamespaceRequest,
    userAgent
  );

  // Extract the JWT string from the requests array
  // The initiate_request returns {requests: [jwtstring]}
  const jwtString = requests?.[0];
  if(!jwtString) {
    throw new Error('No authorization request JWT returned from DC API');
  }

  // Decode JWT payload to get authorization request object
  const authorizationRequest = decodeJwt(jwtString);

  // Update exchange with authorization request (decoded object) and JWT string
  updatedExchange.variables.authorizationRequest = authorizationRequest;
  updatedExchange.variables.authorizationRequestJwt = jwtString;
  updatedExchange.state = 'active';
  updatedExchange.updatedAt = new Date();

  // Return in format expected by middleware
  return {
    authorizationRequest,
    authorizationRequestJwt: jwtString,
    updatedExchange
  };
}

/**
 * Handle authorization response for 18013-7-Annex-D-spruceid profile
 * @param {Object} options - Options object
 * @param {Object} options.workflow - The workflow configuration
 * @param {Object} options.exchange - The exchange object
 * @param {string} options.responseUrl - The response URL
 * @param {Object} options.responseBody - The response body from the client
 * @returns {Promise<Object>} Object containing updatedExchange
 */
export async function handleAuthorizationResponse({
  workflow,
  exchange,
  responseUrl,
  responseBody
}) {
  if(!isDcApiAvailable(config.opencred)) {
    const error = new Error(
      'DC API is not available: signing key certificate is not configured'
    );
    error.statusCode = 503;
    error.errorCode = 'DC_API_UNAVAILABLE';
    throw error;
  }

  if(workflow?.dcApiEnabled === false) {
    const error = new Error(
      'DC API is not enabled for this workflow'
    );
    error.statusCode = 403;
    error.errorCode = 'DC_API_DISABLED';
    throw error;
  }

  const sessionId =
    exchange.variables.dcApiSession
      .session_creation_response.id;
  const sessionSecret =
    exchange.variables.dcApiSession
      .session_creation_response.client_secret;

  if(!sessionSecret || !sessionId) {
    throw new Error('Session data missing from exchange');
  }

  // Create DcApi instance with exchange-specific session stores
  const {dcApi, updatedExchange} =
    await createDcApiInstance(exchange, responseUrl);

  const results = await dcApi.submit_response(
    sessionId,
    sessionSecret,
    responseBody
  );

  if(!updatedExchange.variables) {
    updatedExchange.variables = {};
  }

  return {
    ...updatedExchange,
    state: 'complete',
    updatedAt: new Date(),
    step: 'default',
    oidc: {
      code: await createId(),
      state: exchange.oidc?.state
    },
    variables: {
      ...updatedExchange.variables,
      results: {
        default: results
      }
    }
  };
}

// Export session store creation for tests
export {createSessionStores};
