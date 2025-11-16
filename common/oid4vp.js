import * as bedrock from '@bedrock/core';
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
 * Construct legacy input_descriptors from compact query format
 */
const inputDescriptorsFromQuery = async ({query, description}) => {
  const inputDescriptors = {
    id: await createId(),
    format: supportedVcFormats,
    purpose: description,
    constraints: {
      fields: [
        {
          path: ['$.vc.type', '$.verifiableCredential.type', '$.type'],
          filter: {
            type: 'string',
            pattern: query.type
          }
        }
      ]
    }
  };
  return [inputDescriptors];
};

/**
 * Convert dcql_query to input_descriptors
 */
const inputDescriptorsFromDcql = async ({dcql_query, description}) => {
  // Convert dcql_query to input_descriptors
  if(!dcql_query.credentials || !Array.isArray(dcql_query.credentials) ||
    dcql_query.credentials.length === 0) {
    return [];
  }

  const inputDescriptors = await Promise.all(
    dcql_query.credentials.map(async credential => {
      const fields = [];

      // Convert claims to fields
      // Group claims by path to combine values for the same path
      const claimsByPath = new Map();
      if(credential.claims && Array.isArray(credential.claims)) {
        for(const claim of credential.claims) {
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
      }

      // Convert grouped claims to fields
      for(const [pathKey, allValues] of claimsByPath.entries()) {
        // Convert claim paths to input descriptor paths
        // For JWT format, paths like $.vc.context should map to $['@context']
        // For LDP format, paths like $.type should map to $['type']
        // Always return path as an array of strings
        let convertedPath;
        if(credential.format === 'jwt_vc_json') {
          // Convert $.vc.context to $['@context']
          if(pathKey === '$.vc.context' || pathKey === '$.vc.@context') {
            convertedPath = ['$[\'@context\']'];
          } else {
            // Keep other paths as-is for JWT, ensure it's an array
            convertedPath = Array.isArray(pathKey) ? pathKey : [pathKey];
          }
        } else if(credential.format === 'ldp_vc') {
          // For LDP, ensure proper bracket notation
          if(pathKey === '$.type') {
            convertedPath = ['$[\'type\']'];
          } else {
            // Keep other paths as-is for LDP, ensure it's an array
            convertedPath = Array.isArray(pathKey) ? pathKey : [pathKey];
          }
        } else {
          // Ensure it's always an array
          convertedPath = Array.isArray(pathKey) ? pathKey : [pathKey];
        }

        // Convert values to filter.allOf format (deduplicate)
        const uniqueValues = [...new Set(allValues)];
        const allOf = uniqueValues.map(value => ({
          contains: {
            type: typeof value === 'string' ? 'string' :
              typeof value === 'number' ? 'number' :
                typeof value === 'boolean' ? 'boolean' : 'string',
            const: value
          }
        }));

        fields.push({
          path: convertedPath,
          filter: {
            type: 'array',
            allOf
          }
        });
      }

      // Convert meta.type_values to type field constraints
      if(credential.meta && credential.meta.type_values &&
        Array.isArray(credential.meta.type_values) &&
        credential.meta.type_values.length > 0) {
        // Flatten type_values (array of arrays) to single array
        const cTypes = credential.meta.type_values.flat();
        if(cTypes.length > 0) {
          // Always use array format for path
          const typePaths = credential.format === 'jwt_vc_json' ?
            ['$.vc.type', '$.verifiableCredential.type', '$.type'] :
            ['$[\'type\']'];

          fields.push({
            path: typePaths,
            filter: {
              type: 'array',
              allOf: cTypes.map(iri => ({
                contains: {
                  type: 'string',
                  const: iri
                }
              }))
            }
          });
        }
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
export const getInputDescriptors = async ({rp, exchange, domain, url}) => {
  const {dcql_query, query} = rp;
  const {challenge} = exchange;

  // New compact RP config method using rp.query
  if(query) {
    return inputDescriptorsFromQuery({
      query, description: rp.description
    });
  }

  if(dcql_query) {
    return inputDescriptorsFromDcql({dcql_query, description: rp.description});
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

export const getDcqlQuery = async ({rp, exchange}) => {
  const {dcql_query, query, verifiablePresentationRequest} = rp;
  const {challenge} = exchange;

  if(dcql_query) {
    return dcql_query;
  }

  // New compact RP config method using rp.query
  let requestedType;
  let requestedTypeIri;
  if(query) {
    requestedTypeIri = await getTypeIri({
      contexts: query.contexts,
      type: query.type
    });
    requestedType = query.type;
  } else {
    // Or fall back to legacy verbose config method.
    const vpr = JSON.parse(verifiablePresentationRequest);
    vpr.challenge = challenge;
    const fromVPR = oid4vp.fromVpr({
      verifiablePresentationRequest: vpr,
      prefixVC: true
    });
    try {
      requestedType = fromVPR.presentation_definition.input_descriptors[0].
        constraints.fields.find(
          f => f.path.some(p => p.includes('type')))
        .filter.contains[0].const;
    } catch{
      requestedType = 'VerifiableCredential';
    }
  }

  const baseQuery = {
    multiple: false,
    require_cryptographic_holder_binding: true,
    // trusted_authorities: [] // TODO - optional
    meta: {
      type_values: [
        [requestedTypeIri]
      ]
    }
  };
  const dcqlQuery = {
    credentials: [
      { // 1: JWT
        ...baseQuery,
        id: await createId(),
        format: 'jwt_vc_json',
        claims: [{
          path: ['$.vc.type', '$.verifiableCredential.type', '$.type'],
          values: [requestedType]
        }],
      },
      {
        // 2: LDP_VC
        ...baseQuery,
        id: await createId(),
        format: 'ldp_vc',
        claims: [{
          path: ['$.type'],
          values: [requestedType]
        }]
      }
    ]
  };
  return dcqlQuery;
};

export const getAuthorizationRequest = async ({rp, exchange, domain, url}) => {
  // Draft 18 format: vp_formats with jwt_vp_json and ldp_vp keys
  const vpFormatsDraft18 = {
    jwt_vp_json: {
      alg: ['ES256'],
      alg_values: ['ES256'],
    },
    ldp_vp: {
      proof_type: ['ecdsa-rdfc-2019'],
    }
  };

  // OID4VP 1.0 format: vp_formats_supported with jwt_vc_json and ldp_vc keys
  const vpFormatsSupported = {
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

  const authorizationRequest = {
    response_type: 'vp_token',
    response_mode: 'direct_post',
    client_id: domainToDidWeb(domain),
    client_id_scheme: 'did',
    nonce: exchange.challenge,
    response_uri: url.replace('request', 'response'),
    state: await createId(),

    // Deprecated in draft 25
    presentation_definition: {
      id: await createId(),
      input_descriptors: await getInputDescriptors({
        rp, exchange, domain, url})
    },

    dcql_query: await getDcqlQuery({rp, exchange}),
    client_metadata: {
      client_name: 'OpenCred Verifier',
      subject_syntax_types_supported: [
        'did:jwk', 'did:key', 'did:web'
      ],
      vp_formats: vpFormatsDraft18, // Draft 18 format
      vp_formats_supported: vpFormatsSupported, // OID4VP 1.0 format
    },
  };
  return authorizationRequest;
};

