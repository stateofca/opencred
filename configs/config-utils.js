/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as z from 'zod';
import crypto from 'node:crypto';
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
  cta: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
    .optional().default(DEFAULT_BRAND.cta),
  primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
    .optional().default(DEFAULT_BRAND.primary),
  header: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
    .optional().default(DEFAULT_BRAND.header),
  primaryLogo: z.union([z.string(), ImgSchema]).optional(),
  secondaryLogo: z.union([z.string(), ImgSchema]).optional(),
  primaryLink: z.string().optional(),
  secondaryLink: z.string().optional(),
  homeLink: z.string().optional(),
  backgroundImage: z.url().optional(),
  showQuerySummary: z.boolean().default(true)
});

const redirectUriSchema = z.union([
  z.url(),
  z.array(z.url()).min(1)
]).transform(uri => {
  const list = Array.isArray(uri) ? uri : [uri];
  return [...new Set(list)];
});

const OpenIdConnectSchema = z.object({
  redirectUri: redirectUriSchema,
  claims: z.array(z.object({
    name: z.string(),
    path: z.string(),
    format: z.enum(['ldp_vc', 'mso_mdoc']).default('ldp_vc')
  })).default([]),
  idTokenExpirySeconds: z.number().default(3600)
});

// Curates the callback request body. When unset on the callback, the legacy
// payload (full exchange variables) is sent for backwards compatibility.
export const CallbackBodySchema = z.object({
  // allowlist of exchange variable names to include in the callback body;
  // omitted or [] => no plain variables are sent
  variables: z.array(z.string()).default([]),
  // include the raw submitted vp_token at the top level of the payload
  vpToken: z.boolean().default(false),
  // include the verified verifiablePresentation object at the top level
  verifiablePresentation: z.boolean().default(false),
  // include the credential(s) extracted from the presentation at the top level
  verifiableCredential: z.boolean().default(false)
});

export const CallbackSchema = z.object({
  url: z.url(),
  headersVariable: z.string().optional(),
  // static headers sent with callback, none if unset
  headers: z.record(z.string(), z.string()).optional(),
  // curate the callback request body; unset => legacy full-variables payload
  body: CallbackBodySchema.optional(),
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
  fieldsToRetain: z.record(z.string(), z.array(z.string())).optional(),
  format: z.array(
    z.enum(['jwt_vc_json', 'ldp_vc', 'mso_mdoc'])).default(['ldp_vc'])
})).min(1);

// Query by Example schema for lightweight VC queries
export const QueryByExampleSchema = z.object({
  '@context': z.array(z.string()).min(1),
  type: z.array(z.string()).min(1)
});

export const availableWallets = [
  'cadmv-android', 'cadmv-ios', 'lcw', 'google-wallet', 'apple-wallet',
  'vcalm-interaction'];

// Base Workflow schema
export const BaseWorkflowSchema = z.object({
  clientId: z.string(), // Used to identify the workflow
  clientSecret: z.string(), // To authenticate exchange API requests
  // Legacy fallback identifier for URL-path resolution
  workflowId: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
  configFrom: z.string().optional(), // Used to reference a different workflow
  name: z.string().optional(),
  description: z.string().optional(),
  brand: BrandSchema.optional(),
  caStore: z.boolean().default(true), // If false, cert/x5c checks are skipped
  // By default,experimental DC API is disabled
  dcApiEnabled: z.boolean().default(false),
  // Whether the Interaction URL (qr-and-copy) profile is a default
  // (locked-on) picker option. When undefined here, inherits from
  // options.interactEnabled (global default: true).
  interactEnabled: z.boolean().optional(),
  wallets: z.array(z.enum(availableWallets)).optional(),
  oidc: OpenIdConnectSchema.optional(),
  callback: CallbackSchema.optional(),
  translations: z.record(z.string(), z.record(z.string(), z.string()))
    .optional(), // Override default text labels in the UI
  trustedCredentialIssuers: z.array(z.string()).optional(),
  untrustedVariableAllowList: z.array(z.string()).default([]),
  // exchange vars appended to the redirect as query params, none if unset
  redirectVariableAllowList: z.array(z.string()).default([]),
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
    .default(['cadmv-android', 'cadmv-ios', 'lcw']),
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
  exchangeTtlDisplayThresholdSeconds: z.number()
    .default(60) // 1 minute
    .transform(val => Math.floor(Math.min(
      Math.max(val, 0), // Min 0 seconds (timer never shows when 0)
      900 // Max matches exchangeTtlSeconds upper bound
    ))),
  includeQRByDefault: z.boolean().default(true),

  // Default visibility of the Interaction URL (qr-and-copy) interaction method
  // in the exchange picker. default true. When false, method is available
  // only via the advanced-settings.
  interactEnabled: z.boolean().default(true),

  // Show the wallet launch button on desktop qr-and-link screens. Default
  // false: desktop users only see the QR code. Enable as a debugging
  // affordance — the launch link exposes the openid4vp:// request URL via
  // right-click / copy link.
  oid4vpDisplayLinkOnDesktop: z.boolean().default(false),

  OID4VPdefault: z.enum([
    'OID4VP-draft18', 'OID4VP-combined', 'OID4VP-1.0'
  ]).default('OID4VP-combined'),
  workflowListingEnabled: z.boolean().default(false),
  debug: z.boolean().default(false),

  // Experimental request-shaping knobs for the google-wallet (x509_hash)
  // profile, used to debug Google Wallet DC API rejection. Defaults
  // preserve the encrypted dc_api.jwt behavior.
  googleWalletRequest: z.object({
    omitState: z.boolean().default(false),
    omitCredentialSets: z.boolean().default(false),
    responseMode: z.enum(['dc_api.jwt', 'dc_api']).default('dc_api.jwt')
  }).default({})
}).transform(data => {
  // exchangeTtlSeconds cannot exceed recordExpiresDurationMs
  const maxExchangeTtl = Math.min(900, data.recordExpiresDurationMs / 1000);
  const clampedTtl = Math.min(data.exchangeTtlSeconds, maxExchangeTtl);
  return {
    ...data,
    exchangeTtlSeconds: clampedTtl,
    exchangeTtlDisplayThresholdSeconds: Math.min(
      data.exchangeTtlDisplayThresholdSeconds, clampedTtl
    )
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
  mainDocument: z.preprocess(
    val => typeof val === 'string' ? JSON.parse(val) : val,
    z.record(z.string(), z.unknown())
  ).optional(),
  linkageDocument: z.preprocess(
    val => typeof val === 'string' ? JSON.parse(val) : val,
    z.record(z.string(), z.unknown())
  ).optional()
});

// Signing key schema
export const SigningKeySchema = z.object({
  type: z.enum(['ES256', 'RS256']),
  id: z.string().optional(),
  purpose: z.array(z.string()).refine(val => val.length > 0, {
    message: 'Purpose must be an array of at least one string'
  }),
  privateKeyPem: z.string(),
  publicKeyPem: z.string(),
  certificatePem: z.string().optional()
});

/** Base fields shared by all wallet-certificate entries. */
const WalletCertificateBase = z.object({
  id: z.string().min(1),
  type: z.enum(['ES256']),
  privateKeyPem: z.string(),
  publicKeyPem: z.string(),
  certificatePem: z.string(),
  displayName: z.string().optional()
});

export const AppleWalletCertificateSchema = WalletCertificateBase.extend({
  wallet: z.literal('apple-wallet'),
  apple: z.object({}).optional()
});

export const GoogleWalletCertificateSchema = WalletCertificateBase.extend({
  wallet: z.literal('google-wallet'),
  // Google-Wallet-specific settings. `rpMetadataBytes` is the
  // Base64URL-encoded CBOR relying-party metadata Google requires in
  // client_metadata.gw_rp_metadata_bytes (stored verbatim).
  google: z.object({
    rpMetadataBytes: z.string().optional()
  }).optional()
});

export const WalletCertificateSchema = z.discriminatedUnion('wallet', [
  AppleWalletCertificateSchema,
  GoogleWalletCertificateSchema
]);

// Main OpenCred configuration schema
export const OpenCredConfigSchema = z.object({
  options: OptionsSchema.optional(),
  workflows: z.array(WorkflowSchema),
  defaultLanguage: z.string().optional(),
  translations: z.record(z.string(), z.record(z.string(), z.string()))
    .optional(),
  customTranslateScript: z.string().optional(),
  defaultBrand: BrandSchema.default(DEFAULT_BRAND),
  didWeb: DidWebSchema.default({mainEnabled: true, linkageEnabled: false}),
  signingKeys: z.array(SigningKeySchema).default([]),
  trustedCredentialIssuers: z.array(z.string()).optional(),
  caStore: z.array(z.object({pem: z.string()})).default([])
    .transform(arr => arr.map(item => item.pem)),
  walletCertificates: z.array(WalletCertificateSchema).default([]),
  reCaptcha: ReCaptchaSchema.default({
    enable: false,
    pages: []
  }),
  audit: AuditSchema.default({enable: false})
}).transform(data => {
  validateWalletCertificates(data.walletCertificates, {logger});
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
 * Fields from a parent workflow that configFrom is allowed to inherit.
 * Only base/shared fields — type-specific fields (query, protocol settings)
 * are never inherited.
 */
export const INHERITABLE_FIELDS = [
  'name',
  'description',
  'brand',
  'caStore',
  'dcApiEnabled',
  'interactEnabled',
  'wallets',
  'oidc',
  'callback',
  'translations',
  'trustedCredentialIssuers',
  'untrustedVariableAllowList',
  'redirectVariableAllowList',
  'public',
  'clientSecret'
];

/**
 * Resolve configFrom inheritance for a workflow. Returns only the
 * inheritable base fields from the referenced parent workflow.
 *
 * Constraints:
 * - Parent must exist in the workflows array.
 * - Parent must not itself use configFrom (max 1 level of inheritance).
 *
 * @param {object} options - Options object.
 * @param {object} options.workflow - The child workflow with configFrom set.
 * @param {Array} options.workflows - Array of all workflow configurations.
 * @returns {object} - Object containing only inheritable fields from parent.
 */
export const resolveConfigFrom = ({workflow, workflows}) => {
  const parent = workflows.find(r => r.clientId === workflow.configFrom);
  if(!parent) {
    const error = new Error(
      `[${workflow.clientId}]: configFrom "${workflow.configFrom}" not found`
    );
    logger.error(error.message);
    throw error;
  }

  if(parent.configFrom) {
    const error = new Error(
      `[${workflow.clientId}]: configFrom target "${parent.clientId}" itself ` +
      `uses configFrom — only 1 level of inheritance is allowed`
    );
    logger.error(error.message);
    throw error;
  }

  logger.info(
    `[${workflow.clientId}]: inheriting base config from ` +
    `"${parent.clientId}"`
  );

  if(parent.type && workflow.type && parent.type !== workflow.type) {
    logger.info(
      `[${workflow.clientId}]: cross-type configFrom inheritance ` +
      `(parent: ${parent.type}, child: ${workflow.type})`
    );
  }

  // Pick only inheritable fields from the parent
  const inherited = {};
  for(const field of INHERITABLE_FIELDS) {
    if(field in parent) {
      inherited[field] = parent[field];
    }
  }

  return inherited;
};

/**
 * Deep-merge translations from parent and child at the per-locale level.
 * Each locale is shallow-merged: child keys override parent keys within the
 * same locale; parent-only keys are preserved. Locales absent on the child
 * are inherited wholesale from the parent.
 *
 * @param {object|undefined} parentTranslations - Parent translations object.
 * @param {object|undefined} childTranslations - Child translations object.
 * @returns {object|undefined} - Merged translations, or undefined if both
 *   inputs are falsy.
 */
export const mergeTranslations = (parentTranslations, childTranslations) => {
  if(!parentTranslations && !childTranslations) {
    return undefined;
  }
  if(!parentTranslations) {
    return childTranslations;
  }
  if(!childTranslations) {
    return parentTranslations;
  }

  const merged = {...parentTranslations};
  for(const locale of Object.keys(childTranslations)) {
    merged[locale] = {
      ...(parentTranslations[locale] ?? {}),
      ...childTranslations[locale]
    };
  }
  return merged;
};

/**
 * Populate workflow with defaults from root brand and configFrom parent.
 *
 * When configFrom is set, only base/shared fields are inherited from the
 * parent workflow. Type-specific fields (query, dcql_query, etc.) are never
 * inherited — the child must always provide its own type and credential
 * request configuration.
 *
 * @param {object} options - Options object.
 * @param {object} options.opencred - The opencred configuration object.
 * @param {Array} options.workflows - Array of workflow configurations.
 * @param {object} options.workflow - The workflow configuration to populate.
 * @returns {object} - Workflow configuration object with defaults applied.
 */
export const applyWorkflowDefaults = ({opencred, workflows, workflow}) => {
  const baseBrand = {...DEFAULT_BRAND, ...(opencred.defaultBrand ?? {})};

  if(workflow.configFrom) {
    if(typeof workflow.configFrom !== 'string') {
      const error = new Error(
        `[${workflow.clientId}]: configFrom must be a string`
      );
      logger.error(error.message);
      throw error;
    }

    const inherited = resolveConfigFrom({workflow, workflows});

    // Brand merge: baseBrand → parent brand → child brand
    const parentBrand = inherited.brand ?
      {...baseBrand, ...inherited.brand} : baseBrand;
    const mergedBrand = {...parentBrand, ...(workflow.brand ?? {})};

    // Translations merge: parent.<locale> → child.<locale> (per-key)
    const mergedTranslations = mergeTranslations(
      inherited.translations, workflow.translations
    );

    return {
      ...inherited,
      ...workflow,
      brand: mergedBrand,
      ...(mergedTranslations && {translations: mergedTranslations})
    };
  }

  // No configFrom: merge base brand with workflow's brand overrides
  const mergedBrand = {...baseBrand, ...(workflow.brand ?? {})};
  return {
    ...workflow,
    brand: mergedBrand
  };
};

/**
 * Validate wallet-certificate entries post-zod-parse.
 *
 * Hard-fails (throws) on:
 * - duplicate `id` across entries
 * - unparseable `privateKeyPem` or `certificatePem`.
 *
 * Warns (via logger, continues) on:
 * - leaf cert SPKI does not match `publicKeyPem`
 * - notBefore is future / notAfter is past (according to the leaf cert)
 * - private key does not match the leaf cert's public key.
 *
 * @param {Array} entries - Parsed walletCertificates entries.
 * @param {{logger: object}} deps - Logger with `.warn` / `.error`.
 */
export function validateWalletCertificates(entries, {logger: log}) {
  const seenIds = new Set();
  for(const entry of entries) {
    if(seenIds.has(entry.id)) {
      throw new Error(
        `walletCertificates: duplicate id "${entry.id}"`
      );
    }
    seenIds.add(entry.id);

    let privateKeyObj;
    try {
      privateKeyObj = crypto.createPrivateKey(entry.privateKeyPem);
    } catch(err) {
      throw new Error(
        `walletCertificates[${entry.id}]: invalid privateKeyPem: ` +
        err.message
      );
    }

    let cert;
    try {
      cert = new crypto.X509Certificate(entry.certificatePem);
    } catch(err) {
      throw new Error(
        `walletCertificates[${entry.id}]: invalid certificatePem: ` +
        err.message
      );
    }

    // SPKI ↔ publicKeyPem match (warn only).
    try {
      const certSpkiDer = cert.publicKey.export({
        type: 'spki', format: 'der'
      });
      const publicKeyObj = crypto.createPublicKey(entry.publicKeyPem);
      const providedSpkiDer = publicKeyObj.export({
        type: 'spki', format: 'der'
      });
      if(!certSpkiDer.equals(providedSpkiDer)) {
        log.warning(
          `walletCertificates[${entry.id}]: leaf cert SPKI does not ` +
          `match publicKeyPem; wallets that verify the signature ` +
          `against the cert public key will reject signed requests`
        );
      }
    } catch(err) {
      log.warning(
        `walletCertificates[${entry.id}]: unable to compare SPKI ` +
        `vs publicKeyPem: ${err.message}`
      );
    }

    // notBefore / notAfter bounds (warn only).
    const now = Date.now();
    const notBefore = Date.parse(cert.validFrom);
    const notAfter = Date.parse(cert.validTo);
    if(Number.isFinite(notBefore) && notBefore > now) {
      log.warning(
        `walletCertificates[${entry.id}]: notBefore ` +
        `${cert.validFrom} is in the future`
      );
    }
    if(Number.isFinite(notAfter) && notAfter < now) {
      log.warning(
        `walletCertificates[${entry.id}]: notAfter ` +
        `${cert.validTo} is in the past; wallet will reject the cert`
      );
    }

    // Private-key-matches-cert: derive public key from private key and
    // compare to cert.publicKey. This is stronger than the publicKeyPem
    // check above but is still warn-only (avoid hard-failing on config
    // mismatch per Q17).
    try {
      const derivedPublicDer = crypto.createPublicKey(privateKeyObj).export(
        {type: 'spki', format: 'der'}
      );
      const certPublicDer = cert.publicKey.export(
        {type: 'spki', format: 'der'}
      );
      if(!derivedPublicDer.equals(certPublicDer)) {
        log.warning(
          `walletCertificates[${entry.id}]: privateKeyPem does not ` +
          `correspond to the leaf cert's public key; ReaderAuth ` +
          `signatures produced with this entry will not verify`
        );
      }
    } catch(err) {
      log.warning(
        `walletCertificates[${entry.id}]: unable to derive public ` +
        `key from privateKeyPem: ${err.message}`
      );
    }

    // Google Wallet requires relying-party branding metadata in the
    // authorization request (client_metadata.gw_rp_metadata_bytes).
    // Warn-only: a missing/invalid value should not block startup.
    if(entry.wallet === 'google-wallet') {
      const rpMetadataBytes = entry.google?.rpMetadataBytes;
      if(!rpMetadataBytes) {
        log.warning(
          `walletCertificates[${entry.id}]: google.rpMetadataBytes is ` +
          `not set; Google Wallet requires client_metadata.` +
          `gw_rp_metadata_bytes and may reject requests without it`
        );
      } else if(!_isBase64Url(rpMetadataBytes)) {
        log.warning(
          `walletCertificates[${entry.id}]: google.rpMetadataBytes is ` +
          `not valid Base64URL; Google Wallet will reject the request`
        );
      }
    }
  }
}

/**
 * Lightweight Base64URL check (no padding). Does not decode CBOR.
 *
 * @param {string} value - Candidate Base64URL string.
 * @returns {boolean} True when the value is a non-empty Base64URL string.
 */
function _isBase64Url(value) {
  return typeof value === 'string' && value.length > 0 &&
    /^[A-Za-z0-9_-]+$/.test(value);
}
