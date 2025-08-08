/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import QRCode from 'qrcode';

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

/**
 * The middleware for the exchange type will attach the exchange to req.
 */
export const getExchangeStatus = async (req, res) => {
  const exchange = req.exchange;
  res.send({exchange});
};
