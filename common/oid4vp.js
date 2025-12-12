import * as bedrock from '@bedrock/core';
import {arrayOf} from './utils.js';
import {config} from '@bedrock/core';
import {createId} from './utils.js';
import {defaultDocLoader} from './documentLoader.js';
import {domainToDidWeb} from './didWeb.js';
import jsonld from 'jsonld';

const supportedVcFormats = {
  jwt_vc_json: {
    alg: ['ES256']
  },
  ldp_vc: {
    proof_type: ['DataIntegrityProof', 'ecdsa-rdfc-2019'], // Deprecated
    proof_type_values: ['DataIntegrityProof'],
    cryptosuite_values: ['ecdsa-rdfc-2019']
  }
};

/**
 * Create field filter from values
 */
const createFieldFilter = values => {
  const uniqueValues = [...new Set(values)];
  const allOf = uniqueValues.map(value => ({
    contains: {
      type: typeof value === 'string' ? 'string' :
        typeof value === 'number' ? 'number' :
          typeof value === 'boolean' ? 'boolean' : 'string',
      const: value
    }
  }));

  return {
    type: 'array',
    allOf
  };
};

/**
 * Construct legacy input_descriptors from compact query format
 */
const inputDescriptorsFromQuery = async ({query, description}) => {
  const fields = [];

  // Determine which formats to support (default to ldp_vc)
  const formats = query.format || ['ldp_vc'];
  const hasJwtFormat = formats.includes('jwt_vc_json');

  // Build format object based on requested formats
  const formatObject = {};
  if(hasJwtFormat && supportedVcFormats.jwt_vc_json) {
    formatObject.jwt_vc_json = supportedVcFormats.jwt_vc_json;
  }
  if((formats.includes('ldp_vc') || formats.includes('mso_mdoc')) &&
    supportedVcFormats.ldp_vc) {
    formatObject.ldp_vc = supportedVcFormats.ldp_vc;
  }

  // Add type field if query.type exists and has items
  if(query.type && arrayOf(query.type).length > 0) {
    // Determine paths based on format
    const typePaths = hasJwtFormat ?
      ['$[\'type\']', '$[\'vc\'][\'type\']'] :
      ['$[\'type\']'];

    fields.push({
      path: typePaths,
      filter: createFieldFilter(arrayOf(query.type))
    });
  }

  // Add context field if query.context exists and has items
  if(query.context && arrayOf(query.context).length > 0) {
    // Determine paths based on format
    const contextPaths = hasJwtFormat ?
      ['$[\'@context\']', '$[\'vc\'][\'@context\']'] :
      ['$[\'@context\']'];

    fields.push({
      path: contextPaths,
      filter: createFieldFilter(arrayOf(query.context))
    });
  }

  // Add fields from query.fields if it exists
  if(query.fields && typeof query.fields === 'object') {
    for(const [fieldKey, fieldValues] of Object.entries(query.fields)) {
      if(Array.isArray(fieldValues) && fieldValues.length > 0) {
        // Determine path based on format and field key
        let fieldPath;
        if(hasJwtFormat) {
          // For JWT format, use both paths
          fieldPath = [`$[\'vc\'][\'${fieldKey}\']`, `$[\'${fieldKey}\']`];
        } else {
          // For LDP format, use single path
          fieldPath = [`$[\'${fieldKey}\']`];
        }

        fields.push({
          path: fieldPath,
          filter: createFieldFilter(fieldValues)
        });
      }
    }
  }

  const inputDescriptors = {
    id: await createId(),
    format: formatObject,
    ...(description ? {purpose: description} : {}),
    constraints: {
      fields
    }
  };
  return inputDescriptors;
};

/**
 * Get input descriptors for presentation definition.
 * Transforms from query format (query is required in workflow config).
 */
export const getInputDescriptors = async ({workflow}) => {
  const {query} = workflow;

  // Transform from query (query is now required)
  return Promise.all(query.map(async q => {
    return inputDescriptorsFromQuery({
      query: q, description: workflow.description
    });
  }));
};

const getTypeIri = async ({contexts, type}) => {
  const doc = {
    '@context': contexts,
    type
  };
  try {
    const expanded = await jsonld.expand(doc, {
      documentLoader: defaultDocLoader
    });
    return expanded[0]['@type'][0];
  } catch(error) {
    throw new bedrock.util.BedrockError(
      `Type "${type}" is not defined in the provided context(s). ` +
      'Please check for typos or ensure the type is included in the context.',
      {
        name: 'TypeNotFoundError',
        details: {type, contexts}
      }
    );
  }
};

/**
 * Get DCQL query for authorization request.
 * Uses dcql_query override if present, otherwise transforms from query.
 * @param {object} options
 * @param {object} options.workflow - The workflow configuration
 * @param {string} options.profile - The OID4VP profile
 * @returns {object} - Object with dcql_query property
 */
export const getDcqlQuery = async ({workflow, profile}) => {
  // DCQL query was not invented in OID4VP-draft18
  if(profile === 'OID4VP-draft18') {
    return {};
  }

  const {dcql_query, query} = workflow;

  // If dcql_query override exists in config, use it directly
  if(dcql_query) {
    return {dcql_query};
  }

  // Otherwise, transform from query (query is required)
  const requestedTypeIris = await Promise.all(query.map(async q => {
    if(!q.type || !Array.isArray(q.type) || q.type.length === 0) {
      return [];
    }
    // Skip type expansion if no context provided
    if(!q.context || !Array.isArray(q.context) || q.context.length === 0) {
      return [];
    }
    // Get IRIs for each type in the q.type array
    const typeIris = await Promise.all(q.type.map(async type => {
      return getTypeIri({
        contexts: q.context,
        type
      });
    }));
    return typeIris;
  }));

  // Generate credential queries for each query object and format
  const credentials = [];
  for(let i = 0; i < query.length; i++) {
    const q = query[i];
    const typeIris = requestedTypeIris[i] || [];
    const formats = q.format || ['ldp_vc'];
    const types = q.type || [];
    const fields = q.fields;

    // Create a credential query for each format
    for(const format of formats) {
      if(format === 'mso_mdoc' && fields) {
        // Handle mso_mdoc format with fields (namespace -> field mappings)
        // Each namespace in fields represents a doctype namespace
        for(const [namespace, fieldNames] of Object.entries(fields)) {
          if(!Array.isArray(fieldNames) || fieldNames.length === 0) {
            continue;
          }

          // Create claims for each field in the namespace
          const claims = fieldNames.map(fieldName => ({
            intent_to_retain: true,
            path: [namespace, fieldName]
          }));

          // Derive doctype_value from namespace
          // (e.g., "org.iso.18013.5.1.mDL")
          const doctypeValue = `${namespace}.mDL`;

          credentials.push({
            id: '0',
            format: 'mso_mdoc',
            multiple: false,
            require_cryptographic_holder_binding: true,
            meta: {
              doctype_value: doctypeValue
            },
            claims
          });
        }
      } else {
        // Handle other formats (jwt_vc_json, ldp_vc) or
        // mso_mdoc without fields
        // Determine path based on format
        let path;
        if(format === 'jwt_vc_json') {
          path = ['$.vc.type', '$.verifiableCredential.type', '$.type'];
        } else {
          // ldp_vc or mso_mdoc
          path = ['$.type'];
        }

        credentials.push({
          id: await createId(),
          format,
          multiple: false,
          require_cryptographic_holder_binding: true,
          // trusted_authorities: [] // TODO - optional
          meta: {
            type_values: typeIris
          },
          claims: [{
            path,
            values: types
          }]
        });
      }
    }
  }

  return {
    dcql_query: {
      credentials
    }
  };
};

// Templates define which components are active for each profile
const TEMPLATES = {
  'OID4VP-draft18': {
    vp_formats: true,
    vp_formats_supported: false,
    presentation_definition: true,
    dcql_query: false
  },
  'OID4VP-1.0': {
    vp_formats: false,
    vp_formats_supported: true,
    presentation_definition: false,
    dcql_query: true
  },
  'OID4VP-combined': {
    vp_formats: true,
    vp_formats_supported: true,
    presentation_definition: true,
    dcql_query: true
  },
  'OID4VP-HAIP-1.0': {
    vp_formats: false,
    vp_formats_supported: true,
    presentation_definition: false,
    dcql_query: true
  }
};

/**
 * Returns vp_formats object or empty object based on profile
 */
export const getVpFormats = ({profile}) => {
  const template = TEMPLATES[profile];
  if(!template || !template.vp_formats) {
    return {};
  }
  return {
    // Draft 18 format: vp_formats with jwt_vp_json and ldp_vp keys
    vp_formats: {
      jwt_vp_json: {
        alg: ['ES256'],
        alg_values: ['ES256'],
      },
      ldp_vp: {
        proof_type: ['ecdsa-rdfc-2019'],
      }
    }
  };
};

/**
 * Returns vp_formats_supported object or empty object based on profile
 */
export const getVpFormatsSupported = ({profile}) => {
  const template = TEMPLATES[profile];
  if(!template || !template.vp_formats_supported) {
    return {};
  }
  const formats = {
    // OID4VP 1.0 format: vp_formats_supported with jwt_vc_json and ldp_vc keys
    jwt_vc_json: {
      alg: ['ES256'],
      alg_values: ['ES256'],
    },
    ldp_vc: {
      proof_type: ['ecdsa-rdfc-2019'],
      proof_type_values: ['DataIntegrityProof'],
      cryptosuite_values: ['ecdsa-rdfc-2019']
    }
  };

  // Add mso_mdoc format for HAIP profile
  if(profile === 'OID4VP-HAIP-1.0') {
    formats.mso_mdoc = {
      alg: ['ES256']
    };
  }

  return {
    vp_formats_supported: formats
  };
};

/**
 * Returns base client_metadata merged with vp format properties
 */
export const getClientMetadata = ({profile}) => {
  const baseMetadata = {
    client_name: 'OpenCred Verifier',
    subject_syntax_types_supported: [
      'did:jwk', 'did:key', 'did:web'
    ]
  };

  const metadata = {
    ...baseMetadata,
    ...getVpFormats({profile}),
    ...getVpFormatsSupported({profile})
  };

  // Add HAIP-specific requirements
  if(profile === 'OID4VP-HAIP-1.0') {
    // HAIP requires encrypted responses
    metadata.encrypted_response_enc_values_supported = ['A128GCM', 'A256GCM'];
  }

  return {
    client_metadata: metadata
  };
};

/**
 * Returns presentation_definition object or empty object based on profile
 */
export const getPresentationDefinition = async ({
  workflow, exchange, domain, url, profile
}) => {
  const template = TEMPLATES[profile];
  if(!template || !template.presentation_definition) {
    return {};
  }

  return {
    presentation_definition: {
      id: await createId(),
      input_descriptors: await getInputDescriptors({
        workflow, exchange, domain, url, profile})
    }
  };
};

/**
 * Generate authorization request for standard OID4VP profiles
 * @deprecated Use profile-specific handlers from lib/workflows/profiles/
 * This function is kept for backward compatibility with tests
 */
export const getAuthorizationRequest = async ({
  workflow, exchange, domain, url, profile, responseMode: responseModeParam
} = {}) => {
  // If no profile provided, use system default from config
  let resolvedProfile = profile;
  if(!resolvedProfile) {
    resolvedProfile = config.opencred?.options?.OID4VPdefault ||
      'OID4VP-combined';
  }

  // Map legacy 'OID4VP' to 'OID4VP-combined' to match default behavior
  if(resolvedProfile === 'OID4VP') {
    resolvedProfile = 'OID4VP-combined';
  }

  // Ensure profile is valid, default to combined if not
  if(!TEMPLATES[resolvedProfile]) {
    resolvedProfile = 'OID4VP-combined';
  }

  // Determine response_mode based on responseMode parameter
  // Default to 'direct_post' for backward compatibility
  let responseMode = 'direct_post';
  if(responseModeParam === 'dc_api' || responseModeParam === 'dc_api.jwt') {
    responseMode = responseModeParam;
  }

  // Compose authorization request from component functions
  const [
    presentationDefinition,
    dcqlQueryComponent,
    clientMetadata
  ] = await Promise.all([
    getPresentationDefinition({
      workflow, exchange, domain, url, profile: resolvedProfile}),
    getDcqlQuery({
      workflow, profile: resolvedProfile}),
    getClientMetadata({profile: resolvedProfile})
  ]);

  const authorizationRequest = {
    response_type: 'vp_token',
    response_mode: responseMode,
    client_id: domainToDidWeb(domain),
    client_id_scheme: 'did',
    nonce: exchange.challenge,
    response_uri: `${domain}${url.replace('request', 'response')}`,
    state: await createId(),
    ...presentationDefinition,
    ...dcqlQueryComponent,
    ...clientMetadata
  };

  return authorizationRequest;
};

