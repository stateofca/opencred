/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {domainToDidWeb} from './didWeb.js';

const OID4VP_1_0_PROFILES = ['OID4VP-1.0', 'OID4VP-combined'];

/**
 * Returns the client_id value for an OID4VP profile.
 * OID4VP 1.0 and OID4VP-combined use decentralized_identifier: prefix;
 * OID4VP-draft18 and 18013-7 profiles use bare DID.
 *
 * @param {object} options - Options object.
 * @param {string} options.profile - OID4VP profile identifier.
 * @param {string} options.domain - Server base URI.
 * @returns {string} Client_id for the authorization request or URL.
 */
export const clientIdForProfile = ({profile, domain}) => {
  const did = domainToDidWeb(domain);
  return OID4VP_1_0_PROFILES.includes(profile) ?
    `decentralized_identifier:${did}` : did;
};

/**
 * Returns an object to spread into the authorization request for
 * client_id_scheme. OID4VP 1.0 and OID4VP-combined omit client_id_scheme
 * (return {}). OID4VP-draft18 and x509_san_dns include it.
 *
 * @param {object} options - Options object.
 * @param {string} options.profile - OID4VP profile identifier.
 * @param {string} options.clientIdScheme - Client ID scheme from request.
 * @returns {object} {} or {client_id_scheme: string} to spread.
 */
export const clientIdSchemeForProfile = ({profile, clientIdScheme}) => {
  const useOid4vp10Format = OID4VP_1_0_PROFILES.includes(profile);
  if(useOid4vp10Format && clientIdScheme !== 'x509_san_dns') {
    return {};
  }
  return {client_id_scheme: clientIdScheme};
};

/**
 * Returns true if the profile supports request_uri_method=post (OID4VP 1.0
 * Section 5.10). OID4VP-draft18 predates this and does not use it.
 *
 * @param {string} profile - OID4VP profile identifier.
 * @returns {boolean} True if the profile should include
 *   request_uri_method=post.
 */
export const profileSupportsRequestUriMethodPost = profile =>
  profile !== 'OID4VP-draft18';
