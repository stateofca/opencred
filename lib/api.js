/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import * as bedrock from '@bedrock/core';
import {combineTranslations} from '../configs/translation.js';
import QRCode from 'qrcode';

/**
 * The middleware for the exchange type will initiate the exchange
 * or return an error response. If successful, the exchange data will
 * be available on the request object `req.exchange`.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
export async function initiateExchange(req, res) {
  const exchangeData = req.exchange;
  if(!exchangeData) {
    res.status(500).send(
      {message: 'Unexpected server error: no exchange data initiated'}
    );
    return;
  }

  // Check if QR code should be included
  const includeQR = exchangeData.OID4VP && (req.query.qr === 'true' ||
    (req.query.qr !== 'false' &&
      bedrock.config.opencred.options.includeQRByDefault));

  const response = {
    ...exchangeData,
    ...(includeQR ? {QR: await QRCode.toDataURL(exchangeData.OID4VP)} : {})
  };

  res.send(response);
}

/**
 * The middleware for the exchange type will attach the exchange to req.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
export const getExchangeStatus = async (req, res) => {
  const exchange = req.exchange;
  res.send({exchange});
};

/**
 * Returns the application configuration for the frontend.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
export const getConfig = (req, res) => {
  const workflow = bedrock.config.opencred.workflows.find(
    r => r.clientId == req.query.client_id
  );
  const {
    defaultLanguage, translations: translationsDraft, options, defaultBrand,
    customTranslateScript, audit,
    // Careful not to expose sensitive information here when pulling from
    // bedrock config!
    reCaptcha: {
      pages,
      version,
      siteKey
    }
  } = bedrock.config.opencred;
  const translations = combineTranslations(
    workflow?.translations ?? {},
    translationsDraft
  );

  const response = {
    defaultLanguage,
    translations,
    options,
    brand: req.workflow?.brand ?? defaultBrand,
    customTranslateScript,
    audit,
    reCaptcha: {
      pages, version, siteKey
    }
  };

  // Include public workflows if workflow listing is enabled
  if(options.workflowListingEnabled) {
    response.publicWorkflows = bedrock.config.opencred.workflows
      .filter(w => w.public === true)
      .map(w => ({
        clientId: w.clientId,
        name: w.name,
        description: w.description
      }));
  }

  res.send(response);
};
