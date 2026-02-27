/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as z from 'zod';
import {logger} from '../lib/logger.js';

// Preset configurations
import {
  preset as iso18013Preset
} from '../common/presets/Iso18013DriversLicenseCredential.js';

const presets = {
  [iso18013Preset.preset]: iso18013Preset
};

// Workflow types enum
export const WorkflowType = {
  VcApi: 'vc-api',
  Native: 'native',
  MicrosoftEntraVerifiedId: 'microsoft-entra-verified-id'
};

export const WorkFlowTypes = Object.values(WorkflowType);

// Image schema
export const ImgSchema = z.object({
  id: z.string(),
  alt: z.string().optional(),
  height: z.string().optional(),
  width: z.string().optional(),
  href: z.string().optional()
});

// Brand schema
const DEFAULT_BRAND = {
  cta: '#006847',
  primary: '#008f5a',
  header: '#004225'
};
export const BrandSchema = z.object({
  cta: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  header: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  primaryLogo: z.union([z.string(), ImgSchema]).optional(),
  secondaryLogo: z.union([z.string(), ImgSchema]).optional(),
  primaryLink: z.string().optional(),
  secondaryLink: z.string().optional(),
  homeLink: z.string().optional(),
  backgroundImage: z.url().optional()
});

const OpenIdConnectSchema = z.object({
  redirectUri: z.url(),
  claims: z.array(z.object({
    name: z.string(),
    path: z.string(),
    format: z.enum(['ldp_vc', 'mso_mdoc']).default('ldp_vc')
  })).default([]),
  idTokenExpirySeconds: z.number().default(3600)
});

export const CallbackSchema = z.object({
  url: z.url(),
  headersVariable: z.string().optional(),
  oauth: z.object({
    issuer: z.string(),
    tokenUrl: z.url(),
    clientId: z.string(),
    clientSecret: z.string(),
    scope: z.array(z.string()).default([])
  }).optional()
});

// DCQL Claims Query schema
export const DcqlClaimsSchema = z.object({
  id: z.string(),
  path: z.array(z.string()).min(1), // non-empty array of path pointers
  values: z.array(z.union([z.string(), z.number(), z.boolean()]))
    .min(1).optional()
});

// DCQL Credential Query meta schema for jwt_vc_json format
export const DcqlCredentialMetaSchema = z.object({
  // array of arrays of type strings
  type_values: z.array(z.array(z.string())).min(1)
});

// DCQL Credential Query schema
export const DcqlCredentialQuerySchema = z.object({
  // alphanumeric, underscore, or hyphen
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  // Supported credential formats
  format: z.enum(['jwt_vc_json', 'ldp_vc']),
  multiple: z.boolean().default(false),
  require_cryptographic_holder_binding: z.boolean().default(true),
  meta: DcqlCredentialMetaSchema.optional(),
  claims: z.array(DcqlClaimsSchema).min(1).optional()
  // TODO: claim_sets processing
  // claim_sets: z.array(z.array(z.string())).min(1).optional()
}).refine(() => {
  // claim_sets MUST NOT be present if claims is absent
  // if(data.claim_sets && !data.claims) {
  //   return false;
  // }
  return true;
}, {
  message: 'claim_sets cannot be present without claims'
});

// DCQL Credential Set Query schema
export const DcqlCredentialSetQuerySchema = z.object({
  // non-empty array of arrays of credential IDs
  options: z.array(z.array(z.string()).min(1)).min(1),
  required: z.boolean().default(true)
});

// DCQL Query schema
export const DcqlQuerySchema = z.object({
  credentials: z.array(DcqlCredentialQuerySchema).min(1) // non-empty array
  // TODO: credential_sets processing
  // credential_sets: z.array(DcqlCredentialSetQuerySchema).min(1).optional()
});

// OpenCred Query format schema
export const OpenCredQuerySchema = z.array(z.object({
  type: z.array(z.string()).optional(),
  context: z.array(z.string()).optional(),
  fields: z.record(z.string(), z.array(z.string())).optional(),
  format: z.array(
    z.enum(['jwt_vc_json', 'ldp_vc', 'mso_mdoc'])).default(['ldp_vc'])
})).min(1);

// Query by Example schema for lightweight VC queries
export const QueryByExampleSchema = z.object({
  '@context': z.array(z.string()).min(1),
  type: z.array(z.string()).min(1)
});

export const availableWallets = [
  'cadmv-wallet', 'lcw', 'google-wallet', 'apple-wallet', 'vcalm-interaction'];

// Base Workflow schema
export const BaseWorkflowSchema = z.object({
  clientId: z.string(), // Used to identify the workflow
  clientSecret: z.string(), // To authenticate exchange API requests
  configFrom: z.string().optional(), // Used to reference a different workflow
  name: z.string().optional(),
  description: z.string().optional(),
  brand: BrandSchema.optional(),
  caStore: z.boolean().default(true), // If false, cert/x5c checks are skipped
  // By default,experimental DC API is disabled
  dcApiEnabled: z.boolean().default(false),
  wallets: z.array(z.enum(availableWallets)).optional(),
  oidc: OpenIdConnectSchema.optional(),
  callback: CallbackSchema.optional(),
  translations: z.record(z.string(), z.record(z.string(), z.string()))
    .optional(), // Override default text labels in the UI
  trustedCredentialIssuers: z.array(z.string()).optional(),
  untrustedVariableAllowList: z.array(z.string())
    .default(['redirectPath'])
    .transform(
      val => val.includes('redirectPath') ? val : [...val, 'redirectPath']
    ), // Ensure 'redirectPath' is always included
  public: z.boolean().default(false)
});

export const PresetWorkflowSchema = z.object({
  ...BaseWorkflowSchema.shape,
  type: z.literal('preset'),
  preset: z.string() // The name of the built-inpreset to use
}).transform(data => {
  return {
    ...data,
    ...presets[data.preset]?.workflow ?? {}
  };
});

// VC API Workflow schema
export const VcApiWorkflowSchema = z.object({
  ...BaseWorkflowSchema.shape,
  type: z.literal('vc-api'),
  capability: z.string().optional(), // authenticate exchange zCAP API requests
  clientSecret: z.string().optional(), // zcap secret
  baseUrl: z.url().optional(), // May be included in capability
  verifiablePresentationRequest: z.string()
});

// Native Workflow schema
export const NativeWorkflowSchema = z.object({
  ...BaseWorkflowSchema.shape,
  type: z.literal('native'),

  // Most versatile format for multi-format conversion
  query: OpenCredQuerySchema.default([]),

  // DC API namespace query for mso_mdoc format w/spruceid handler
  dcApiNamespaceQuery: z.record(z.string(), z.array(z.string())).optional(),

  // OID4VP 1.0 DCQL format (optional override)
  dcql_query: DcqlQuerySchema.optional(),

  // Presentation Exchange verifiablePresentationRequest format
  // (optional override)
  verifiablePresentationRequest: z.string().optional()
}).transform(data => {
  // If dcApiNamespaceQuery is present, transform it to query format to
  // support rendering (dcApiNamespaceQuery has higher precedence)
  if(data.dcApiNamespaceQuery) {
    return {
      ...data,
      query: [{
        fields: data.dcApiNamespaceQuery,
        format: ['mso_mdoc']
      }]
    };
  }
  return data;
}).refine(data => {
  // Ensure query has at least 1 element after transformation
  return data.query && data.query.length >= 1;
}, {
  message: 'query must have at least 1 element',
  path: ['query']
});

// Entra Workflow schema
export const EntraWorkflowSchema = z.object({
  ...BaseWorkflowSchema.shape,
  type: z.literal('microsoft-entra-verified-id'),
  acceptedCredentialType: z.string(),
  credentialVerificationPurpose: z.string().optional(),
  allowRevokedCredentials: z.boolean().default(false),
  validateLinkedDomain: z.boolean().default(false),
  apiBaseUrl: z.url(),
  apiLoginBaseUrl: z.url(),
  apiTenantId: z.string(),
  apiClientId: z.string(),
  apiClientSecret: z.string(),
  verifierDid: z.string(),
  verifierName: z.string()
});

// Union of all workflow types
export const WorkflowSchema = z.discriminatedUnion('type', [
  PresetWorkflowSchema,
  VcApiWorkflowSchema,
  NativeWorkflowSchema,
  EntraWorkflowSchema
]);

export const availableExchangeProtocols = ['openid4vp', 'chapi'];

/** Options schema with validation to clamp time ranges as appropriate. */
export const OptionsSchema = z.object({
  exchangeProtocols: z.array(z.enum(availableExchangeProtocols))
    .default(['openid4vp', 'chapi']),
  wallets: z.array(z.enum(availableWallets))
    .default(['cadmv-wallet', 'lcw']),
  recordExpiresDurationMs: z.number()
    .default(24 * 60 * 60 * 1000) // 1 day in milliseconds
    .transform(val => Math.floor(Math.max(
      Math.min(val, 24 * 60 * 60 * 1000 * 30), // Max 30 days
      60000 // Min 1 minute
    ))),
  exchangeTtlSeconds: z.number()
    .default(900) // 15 minutes in seconds
    .transform(val => Math.floor(Math.min(
      Math.max(val, 10), // Min 10 seconds
      900 // Max 900 seconds
    ))),
  includeQRByDefault: z.boolean().default(true),
  OID4VPdefault: z.enum([
    'OID4VP-draft18', 'OID4VP', 'OID4VP-combined', 'OID4VP-1.0'
  ]).default('OID4VP-combined'),
  workflowListingEnabled: z.boolean().default(false),
  debug: z.boolean().default(false)
}).transform(data => {
  // exchangeTtlSeconds cannot exceed recordExpiresDurationMs
  const maxExchangeTtl = Math.min(900, data.recordExpiresDurationMs / 1000);
  return {
    ...data,
    exchangeTtlSeconds: Math.min(data.exchangeTtlSeconds, maxExchangeTtl)
  };
});

// Audit field schema
export const AuditFieldSchema = z.object({
  type: z.enum(['text', 'number', 'date', 'dropdown']),
  id: z.string(),
  name: z.string(),
  path: z.string(),
  required: z.boolean(),
  options: z.record(z.string(), z.any()).optional()
});

// Audit configuration schema
export const AuditSchema = z.object({
  enable: z.boolean().default(false),
  types: z.array(z.union(
    [
      z.object({
        preset: z.enum(Object.keys(presets))
      }),
      z.object({
        name: z.string(),
        fields: z.array(AuditFieldSchema)
      })
    ]
  )).optional()
}).transform(data => {
  if(!data.enable) {
    return {enable: false};
  }
  // load preset audit configs
  return {
    ...data,
    types: data.types.map(
      t => t.preset ? presets[t.preset]?.auditConfig : t)
  };
}).refine(data => {
  if(data.enable === false) {
    return true;
  }
  for(const type of data.types) {
    if(!type.fields) {
      continue;
    }
    const paths = type.fields.map(f => f.path);
    const sortedPaths = paths.sort();
    const hasUniquePaths = sortedPaths.every(
      (currentPath, currentIndex) =>
        currentIndex === 0 || currentPath !== sortedPaths[currentIndex - 1]
    );
    if(!hasUniquePaths) {
      return false;
    }
  }
  return true;
}, {
  message: 'Each field in "audit.types[].fields" must have a unique "path".'
});

// reCAPTCHA schema with conditional validation
export const ReCaptchaSchema = z.object({
  enable: z.boolean().default(false),
  version: z.number().refine(val => val === 2 || val === 3).optional(),
  siteKey: z.string().optional(),
  secretKey: z.string().optional(),
  pages: z.array(z.string()).default([])
}).refine(data => {
  // If enable is true, version, siteKey, and secretKey are required
  if(data.enable) {
    return data.version !== undefined &&
           data.siteKey !== undefined &&
           data.secretKey !== undefined;
  }
  return true;
}, {
  message: 'When reCaptcha.enable is true, version, siteKey, and ' +
    'secretKey are required'
});

// DID Web schema
export const DidWebSchema = z.object({
  mainEnabled: z.boolean().default(false),
  linkageEnabled: z.boolean().default(false),
  mainDocument: z.record(z.any()).optional(),
  linkageDocument: z.record(z.any()).optional()
});

// Signing key schema
export const SigningKeySchema = z.object({
  type: z.enum(['ES256', 'RS256']),
  purpose: z.array(z.string()).refine(val => val.length > 0, {
    message: 'Purpose must be an array of at least one string'
  }),
  privateKeyPem: z.string(),
  publicKeyPem: z.string(),
  certificatePem: z.string().optional()
});

// Main OpenCred configuration schema
export const OpenCredConfigSchema = z.object({
  options: OptionsSchema.optional(),
  workflows: z.array(WorkflowSchema),
  defaultLanguage: z.string().optional(),
  translations: z.record(z.string(), z.record(z.string(), z.string()))
    .optional(),
  defaultBrand: BrandSchema.default(DEFAULT_BRAND),
  didWeb: DidWebSchema.default({mainEnabled: true, linkageEnabled: false}),
  signingKeys: z.array(SigningKeySchema).default([]),
  trustedCredentialIssuers: z.array(z.string()).optional(),
  caStore: z.array(z.object({pem: z.string()})).default([])
    .transform(arr => arr.map(item => item.pem)),
  reCaptcha: ReCaptchaSchema.optional(),
  audit: AuditSchema.default({enable: false})
}).transform(data => {
  // Ensure options is populated with field-level defaults from OptionsSchema
  // Parse through OptionsSchema to apply defaults for any missing fields
  return {
    ...data,
    options: data.options !== undefined ?
      OptionsSchema.parse(data.options) :
      OptionsSchema.parse({})
  };
});

/**
 * Populate workflow with defaults from root and configFrom peers.
 *
 * @param {object} options - Options object.
 * @param {object} options.opencred - The opencred configuration object.
 * @param {Array} options.workflows - Array of workflow configurations.
 * @param {object} options.workflow - The workflow configuration to populate.
 * @param {Array} options.refs - Array of reference configurations.
 * @returns {object} - Workflow configuration object with defaults applied.
 */
export const applyWorkflowDefaults = (
  {opencred, workflows, workflow, refs = []}
) => {
  const defaultBrand = {brand: opencred.defaultBrand ?? DEFAULT_BRAND};
  if(workflow.configFrom) {
    if(typeof workflow.configFrom !== 'string') {
      const error = new Error(
        `[${workflow.clientId}]: configFrom must be a string`
      );
      logger.error(error.message);
      throw error;
    }
    const configFrom = workflows.find(r => r.clientId === workflow.configFrom);
    if(!configFrom) {
      const error = new Error(
        `[${workflow.clientId}]: configFrom ${workflow.configFrom} not found`
      );
      logger.error(error.message);
      throw error;
    }
    // Check for circular reference: if we've already seen this workflow's
    // clientId or the configFrom's clientId in our reference chain, it's a
    // cycle
    if(refs.includes(workflow.clientId) ||
      refs.includes(configFrom.clientId)) {
      const error = new Error(
        `[${workflow.clientId}]: Circular configFrom reference detected`
      );
      logger.error(error.message);
      throw error;
    }
    if(configFrom.configFrom) {
      return {
        ...defaultBrand,
        ...applyWorkflowDefaults({
          opencred,
          workflows,
          workflow: configFrom,
          refs: refs.concat(workflow.clientId)
        }),
        ...workflow
      };
    }
    return {
      ...defaultBrand,
      ...configFrom,
      ...workflow
    };
  }
  return {
    ...defaultBrand,
    ...workflow
  };
};
