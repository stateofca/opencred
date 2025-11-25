import * as bedrock from '@bedrock/core';
import {arrayOf} from './utils.js';
import {config} from '@bedrock/core';
import {createId} from './utils.js';
import {defaultDocLoader} from './documentLoader.js';
import {domainToDidWeb} from '../lib/didWeb.js';
import jsonld from 'jsonld';
import {oid4vp} from '@digitalbazaar/oid4-client';

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
 * Convert claim path to input descriptor path format
 */
const convertPathForFormat = (pathKey, format) => {
  // Ensure path is always an array
  const ensureArray = path => Array.isArray(path) ? path : [path];

  if(format === 'jwt_vc_json') {
    // Convert $.vc.context to $['@context']
    if(pathKey === '$.vc.context' || pathKey === '$.vc.@context') {
      return ['$[\'@context\']'];
    }
    return ensureArray(pathKey);
  }

  if(format === 'ldp_vc') {
    // Convert $.type to $['type']
    if(pathKey === '$.type') {
      return ['$[\'type\']'];
    }
    return ensureArray(pathKey);
  }

  return ensureArray(pathKey);
};

/**
 * Group claims by path, combining values for the same path
 */
const groupClaimsByPath = claims => {
  const claimsByPath = new Map();

  if(!claims || !Array.isArray(claims)) {
    return claimsByPath;
  }

  for(const claim of claims) {
    if(!claim.path || !Array.isArray(claim.path) ||
      !claim.values || !Array.isArray(claim.values)) {
      continue;
    }

    // Use first path as key (assuming all paths equivalent)
    const pathKey = claim.path[0];
    if(!claimsByPath.has(pathKey)) {
      claimsByPath.set(pathKey, []);
    }
    claimsByPath.get(pathKey).push(...claim.values);
  }

  return claimsByPath;
};

/**
 * Create type field from credential meta.type_values
 */
const createTypeField = credential => {
  const typeValues = credential.meta?.type_values;
  if(!Array.isArray(typeValues) || typeValues.length === 0) {
    return null;
  }

  // Flatten type_values (array of arrays) to single array
  const cTypes = typeValues.flat();
  if(cTypes.length === 0) {
    return null;
  }

  // Determine paths based on format
  const typePaths = credential.format === 'jwt_vc_json' ?
    ['$[\'type\']', '$[\'vc\'][\'type\']'] :
    ['$[\'type\']'];

  return {
    path: typePaths,
    filter: {
      type: 'array',
      allOf: cTypes.map(typeValue => ({
        contains: {
          type: 'string',
          const: typeValue
        }
      }))
    }
  };
};

/**
 * EXPERIMENTAL: Convert dcql_query to input_descriptors
 * For now, we recommend using a vpr or query for draft18 support.
 * Reversing from DCQL is pretty complicated.
 */
const inputDescriptorsFromDcql = async ({dcql_query, description, profile}) => {
  // Early return for draft18 or invalid queries
  if(profile === 'OID4VP-draft18' ||
    !dcql_query?.credentials ||
    !Array.isArray(dcql_query.credentials) ||
    dcql_query.credentials.length === 0) {
    return [];
  }

  const inputDescriptors = await Promise.all(
    dcql_query.credentials.map(async credential => {
      const fields = [];

      // Convert claims to fields
      const claimsByPath = groupClaimsByPath(credential.claims);
      for(const [pathKey, allValues] of claimsByPath.entries()) {
        const convertedPath = convertPathForFormat(pathKey, credential.format);
        const filter = createFieldFilter(allValues);

        fields.push({
          path: convertedPath,
          filter
        });
      }

      // Add type field if present
      const typeField = createTypeField(credential);
      if(typeField) {
        fields.push(typeField);
      }

      return {
        id: credential.id || await createId(),
        ...(description ? {purpose: description} : {}),
        format: supportedVcFormats,
        constraints: {
          fields
        }
      };
    })
  );

  return inputDescriptors;
};

/**
 * Convert verifiablePresentationRequest to input_descriptors
 */
const inputDescriptorsFromVpr = async ({
  verifiablePresentationRequest, challenge, domain, url
}) => {
  const vpr = JSON.parse(verifiablePresentationRequest ?? '{}');
  vpr.domain = `${domain}${url.replace('request', 'response')}`;
  vpr.challenge = challenge;
  const fromVPR = oid4vp.fromVpr({
    verifiablePresentationRequest: vpr,
    prefixVC: true
  });
  const inputDescriptors = fromVPR.presentation_definition
    .input_descriptors.map(i => {
      // Normalize filter.contains to always be an array
      // Normalize path to always be an array of strings
      const normalizedFields = i.constraints?.fields?.map(field => {
        const normalizedField = {...field};

        // Normalize filter.contains to always be an array
        if(field.filter?.contains) {
          const contains = field.filter.contains;
          normalizedField.filter = {
            ...field.filter,
            contains: Array.isArray(contains) ? contains : [contains]
          };
        }

        // Normalize path to always be an array of strings
        if(field.path !== undefined) {
          normalizedField.path = Array.isArray(field.path) ?
            field.path : [field.path];
        }

        return normalizedField;
      }) || i.constraints?.fields;

      return {
        ...i,
        format: supportedVcFormats,
        constraints: {
          ...i.constraints,
          fields: normalizedFields
        }
      };
    });
  return inputDescriptors;
};

/**
 * Deprecated in OID4VP draft 25, this was the old way to define what
 * credential you were looking for.
 */
export const getInputDescriptors = async ({
  rp, exchange, domain, url, profile
}) => {
  const {dcql_query, query} = rp;
  const {challenge} = exchange;

  // New compact RP config method using rp.query:
  // OpenCredQuerySchema[]
  if(query) {
    return Promise.all(query.map(async q => {
      return inputDescriptorsFromQuery({
        query: q, description: rp.description
      });
    }));
  }

  // It is not recommended to customize dcql_query to convert to
  // input_descriptors. Use the query format instead.
  if(dcql_query) {
    return inputDescriptorsFromDcql({
      dcql_query, description: rp.description, profile
    });
  }

  // Or fall back to legacy verbose config method.
  return inputDescriptorsFromVpr({
    verifiablePresentationRequest: rp.verifiablePresentationRequest,
    challenge,
    domain,
    url,
  });
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

export const getDcqlQuery = async ({rp, exchange, profile}) => {
  // DCQL query was not invented in OID4VP-draft18
  if(profile === 'OID4VP-draft18') {
    return {};
  }

  const {dcql_query, query, verifiablePresentationRequest} = rp;
  const {challenge} = exchange;

  let requestedTypeIris;

  if(dcql_query) {
    return {dcql_query};
  } else if(query) {
    // New compact config method using rp.query
    requestedTypeIris = await Promise.all(query.map(async q => {
      if(!q.type || !Array.isArray(q.type) || q.type.length === 0) {
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

      // Create a credential query for each format
      for(const format of formats) {
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

    return {
      dcql_query: {
        credentials
      }
    };
  } else {
    // Or fall back to legacy verifiablePresentationRequest config method.
    const vpr = JSON.parse(verifiablePresentationRequest);
    vpr.challenge = challenge;
    const fromVPR = oid4vp.fromVpr({
      verifiablePresentationRequest: vpr,
      prefixVC: true,
      queryFormats: {
        dcql: true,
        presentationExchange: false
      }
    });
    return {dcql_query: fromVPR.dcql_query};
  }
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
  }
};

/**
 * Returns vp_formats object or empty object based on profile
 */
const getVpFormats = ({profile}) => {
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
const getVpFormatsSupported = ({profile}) => {
  const template = TEMPLATES[profile];
  if(!template || !template.vp_formats_supported) {
    return {};
  }
  return {
    // OID4VP 1.0 format: vp_formats_supported with jwt_vc_json and ldp_vc keys
    vp_formats_supported: {
      jwt_vc_json: {
        alg: ['ES256'],
        alg_values: ['ES256'],
      },
      ldp_vc: {
        proof_type: ['ecdsa-rdfc-2019'],
        proof_type_values: ['DataIntegrityProof'],
        cryptosuite_values: ['ecdsa-rdfc-2019']
      }
    }
  };
};

/**
 * Returns base client_metadata merged with vp format properties
 */
const getClientMetadata = ({profile}) => {
  const baseMetadata = {
    client_name: 'OpenCred Verifier',
    subject_syntax_types_supported: [
      'did:jwk', 'did:key', 'did:web'
    ]
  };

  return {
    client_metadata: {
      ...baseMetadata,
      ...getVpFormats({profile}),
      ...getVpFormatsSupported({profile})
    }
  };
};

/**
 * Returns presentation_definition object or empty object based on profile
 */
const getPresentationDefinition = async ({
  rp, exchange, domain, url, profile
}) => {
  const template = TEMPLATES[profile];
  if(!template || !template.presentation_definition) {
    return {};
  }

  return {
    presentation_definition: {
      id: await createId(),
      input_descriptors: await getInputDescriptors({
        rp, exchange, domain, url, profile})
    }
  };
};

export const getAuthorizationRequest = async ({
  rp, exchange, domain, url, profile
}) => {
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

  // Compose authorization request from component functions
  const [
    presentationDefinition,
    dcqlQueryComponent,
    clientMetadata
  ] = await Promise.all([
    getPresentationDefinition({
      rp, exchange, domain, url, profile: resolvedProfile}),
    getDcqlQuery({
      rp, exchange, profile: resolvedProfile}),
    getClientMetadata({profile: resolvedProfile})
  ]);

  const authorizationRequest = {
    response_type: 'vp_token',
    response_mode: 'direct_post',
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

