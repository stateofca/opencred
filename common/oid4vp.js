import * as jsonld from 'jsonld';
import {createId} from './utils.js';
import {defaultDocLoader} from './documentLoader.js';
import {domainToDidWeb} from '../lib/didWeb.js';
import {oid4vp} from '@digitalbazaar/oid4-client';

/**
 * Deprecated in OID4VP draft 25, this was the old way to define what
 * credential you were looking for.
 */
export const getInputDescriptors = async ({rp, exchange, domain, url}) => {
  const {query} = rp.workflow;
  const {challenge} = exchange;

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

  // New compact RP config method using rp.query
  if(query) {
    // Construct legacy input_descriptors from query
    const inputDescriptors = {
      id: await createId(),
      format: supportedVcFormats,
      purpose: rp.description,
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
    return inputDescriptors;
  }

  // Or fall back to legacy verbose config method.
  const step = rp.workflow.steps[exchange.step];
  const vpr = JSON.parse(step.verifiablePresentationRequest);
  vpr.domain = `${domain}${url.replace('request', 'response')}`;
  vpr.challenge = challenge;
  const fromVPR = oid4vp.fromVpr({
    verifiablePresentationRequest: vpr,
    prefixVC: true
  });
  const inputDescriptors = fromVPR.presentation_definition
    .input_descriptors.map(i => {
      return {
        ...i,
        constraints: step.constraintsOverride ?
          JSON.parse(step.constraintsOverride) : i.constraints,
        format: supportedVcFormats
      };
    });
  return inputDescriptors;
};

const getTypeIri = async ({contexts, type}) => {
  const doc = {
    '@context': contexts,
    type
  };
  const expanded = await jsonld.expand(doc, {documentLoader: defaultDocLoader});
  return expanded[0]['@type'][0];
};

export const getDcqlQuery = async ({rp, exchange}) => {
  const {query} = rp.workflow;
  const {challenge} = exchange;
  let requestedType;
  let requestedTypeIri;

  // New compact RP config method using rp.query
  if(query) {
    requestedTypeIri = await getTypeIri({
      contexts: query.contexts,
      type: query.type
    });
    requestedType = query.type;
  } else {
    // Or fall back to legacy verbose config method.
    const step = rp.workflow.steps[exchange.step];
    const vpr = JSON.parse(step.verifiablePresentationRequest);
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
  const vpFormatsSupported = {
    jwt_vp: {
      alg: ['ES256'], // Deprecated in draft 25
      alg_values: ['ES256'],
    },
    ldp_vp: {
      proof_type: ['ecdsa-rdfc-2019'], // Deprecated in draft 25
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
      vp_formats: vpFormatsSupported, // Deprecated in draft 27
      vp_formats_supported: vpFormatsSupported,
    },
  };
  return authorizationRequest;
};
