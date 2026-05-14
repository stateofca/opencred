/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as bedrock from '@bedrock/core';
import {defaultDocLoader} from '../../../common/documentLoader.js';
import jsonld from 'jsonld';

// Process-level cache for expanded type IRIs.
// Key: JSON.stringify({contexts, type}), Value: expanded IRI string.
const _typeIriCache = new Map();

/**
 * Expand a single JSON-LD type name to its full IRI.
 *
 * Uses JSON-LD expansion with the provided contexts to resolve a compact
 * type name (e.g. "VerifiableCredential") to its full IRI
 * (e.g. "https://www.w3.org/2018/credentials#VerifiableCredential").
 *
 * Results are cached per (contexts, type) combination for the lifetime
 * of the process.
 *
 * @param {object} options - Options object.
 * @param {Array<string>} options.contexts - JSON-LD context URLs.
 * @param {string} options.type - Compact type name to expand.
 * @returns {Promise<string>} - The expanded IRI for the type.
 * @throws {Error} If the type is not defined in the contexts.
 */
export async function getTypeIri({contexts, type}) {
  const cacheKey = JSON.stringify({contexts, type});
  const cached = _typeIriCache.get(cacheKey);
  if(cached) {
    return cached;
  }

  const doc = {'@context': contexts, type};
  let iri;
  try {
    const expanded = await jsonld.expand(doc, {
      documentLoader: defaultDocLoader
    });
    iri = expanded?.[0]?.['@type']?.[0];
  } catch {
    // expansion failed entirely; fall through to error below
  }

  if(!iri || !iri.includes(':')) {
    throw new bedrock.util.BedrockError(
      `Type "${type}" is not defined in the provided context(s). ` +
      'Please check for typos or ensure the type is included in the ' +
      'context.',
      {
        name: 'TypeNotFoundError',
        details: {type, contexts}
      }
    );
  }
  _typeIriCache.set(cacheKey, iri);
  return iri;
}

/**
 * Expand an array of JSON-LD type names to their full IRIs.
 *
 * @param {object} options - Options object.
 * @param {Array<string>} options.types - Array of compact type names.
 * @param {Array<string>} options.contexts - JSON-LD context URLs.
 * @returns {Promise<Array<string>>} - Array of expanded IRIs.
 * @throws {Error} If any type is not defined in the contexts.
 */
export async function expandTypes({types, contexts}) {
  return Promise.all(
    types.map(type => getTypeIri({contexts, type}))
  );
}

/**
 * Clear the type IRI cache. Exported for testing.
 */
export function clearTypeIriCache() {
  _typeIriCache.clear();
}
