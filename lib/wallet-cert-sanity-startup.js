/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as bedrock from '@bedrock/core';
import {logger} from './logger.js';
import {validateWalletCertificates} from
  './workflows/common/wallet-cert-sanity.js';

bedrock.events.on('bedrock.started', async () => {
  const {ok, results} = validateWalletCertificates({
    entries: bedrock.config.opencred?.walletCertificates ?? [],
    baseUri: bedrock.config.server.baseUri
  });
  for(const r of results) {
    const summary = {
      id: r.id,
      wallet: r.wallet,
      subjectCN: r.subjectCN,
      issuerCN: r.issuerCN,
      sanDnsNames: r.sanDnsNames,
      notBefore: r.notBefore,
      notAfter: r.notAfter,
      baseUriMatch: r.baseUriMatch
    };
    if(r.warnings.length > 0) {
      logger.warning('walletCertificates entry has warnings', {
        ...summary,
        warnings: r.warnings
      });
    } else {
      logger.info('walletCertificates entry OK', summary);
    }
  }
  if(!ok) {
    logger.warning(
      'one or more walletCertificates entries have warnings; ' +
      'see preceding log lines'
    );
  }
});
