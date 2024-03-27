/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';
import QRCode from 'qrcode';
import {updateIssuerDidDocumentHistory} from '../common/audit.js';

/**
 * The middleware for the exchange type will initiate the exchange
 * or return an error response. If successful, the exchange data will
 * be available on the request object `req.exchange`.
 */
export async function initiateExchange(req, res) {
  const exchangeData = req.exchange;
  if(!exchangeData) {
    res.status(500).send(
      {message: 'Unexpected server error: no exchange data initiated'}
    );
    return;
  }
  res.send({...exchangeData, QR: await QRCode.toDataURL(exchangeData.OID4VP)});
}

export const getExchangeStatus = async (req, res) => {
  const exchange = req.exchange;
  if(exchange.state === 'complete' && config.opencred.isAuditEnabled()) {
    const {verifiablePresentation} =
      exchange.variables.results[exchange.step];
    await updateIssuerDidDocumentHistory(verifiablePresentation);
  }
  res.send({exchange});
};
