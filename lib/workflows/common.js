import {config} from '@bedrock/core';
import {isDcApiAvailable} from '../../common/dcapi.js';
import {logger} from '../logger.js';
import QRCode from 'qrcode';

export const newExchangeContext = async (req, res) => {
  if(!req.exchange) {
    res.status(404).send('Exchange not found');
    return;
  }
  const rp = req.rp;

  // Check if default OID4VP protocol QR code should be included
  const includeQR = req.exchange.OID4VP && (req.query.qr === 'true' ||
    (req.query.qr !== 'false' && config.opencred.options.includeQRByDefault));

  const exchangeData = {
    ...req.exchange,
    ...(includeQR ? {QR: await QRCode.toDataURL(req.exchange.OID4VP)} : {}),
  };

  // Check if DC API is enabled (both system and workflow level)
  const dcApiEnabled = isDcApiAvailable(config.opencred) &&
    (rp.dcApiEnabled !== false);

  const context = {
    step: 'default',
    rp: {
      clientId: rp.clientId,
      redirectUri: rp.redirectUri,
      name: rp.name,
      brand: rp.brand,
      type: rp.type,
      dcApiEnabled,
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
