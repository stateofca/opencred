import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {isDcApiAvailable} from '../../common/dcapi.js';
import {logger} from '../logger.js';
import QRCode from 'qrcode';

export const newExchangeContext = async (req, res) => {
  if(!req.exchange) {
    res.status(404).send('Exchange not found');
    return;
  }
  const workflow = req.workflow;

  // Check if default OID4VP protocol QR code should be included
  const includeQR = req.exchange.OID4VP && (req.query.qr === 'true' ||
    (req.query.qr !== 'false' && config.opencred.options.includeQRByDefault));

  const exchangeData = {
    ...req.exchange,
    ...(includeQR ? {QR: await QRCode.toDataURL(req.exchange.OID4VP)} : {}),
  };

  // Check if DC API is enabled (both system and workflow level)
  const dcApiEnabled = isDcApiAvailable(config.opencred) &&
    (workflow.dcApiEnabled === true);

  const context = {
    step: 'default',
    workflow: {
      clientId: workflow.clientId,
      redirectUri: workflow.redirectUri,
      name: workflow.name,
      brand: workflow.brand,
      type: workflow.type,
      dcApiEnabled,
      query: workflow.query,
    },
    options: config.opencred.options,
    exchangeData
  };
  try {
    res.send(context);
    return;
  } catch(error) {
    logger.error(error.message, {error});
    res.status(500).send('Error rendering page');
    return;
  }
};

/**
 * Handles a verified presentation by creating an updated exchange
 * @param {object} options
 * @param {object} options.exchange - The current exchange
 * @param {object} options.verifiablePresentation - The verified presentation
 * @param {string|object} options.vpToken - The VP token
 * @returns {Promise<object>} The updated exchange object
 */
export async function handleVerifiedPresentation({
  exchange,
  verifiablePresentation,
  vpToken
}) {
  const updatedExchange = {
    ...exchange,
    sequence: exchange.sequence + 1,
    updatedAt: new Date(),
    state: 'complete',
    oidc: {
      code: await createId(),
      state: exchange.oidc?.state
    },
    variables: {
      ...(exchange.variables ?? {}),
      results: {
        [exchange.step]: {
          verifiablePresentation,
          vpToken
        }
      }
    }
  };
  return updatedExchange;
}
