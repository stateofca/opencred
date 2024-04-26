import {config} from '@bedrock/core';
import {logger} from '../logger.js';
import QRCode from 'qrcode';

export const newExchangeContext = async (req, res) => {
  if(!req.exchange) {
    res.status(404).send('Exchange not found');
  }
  const rp = req.rp;
  const context = {
    step: rp.workflow.initialStep,
    rp: {
      clientId: rp.clientId,
      redirectUri: rp.redirectUri,
      name: rp.name,
      primaryLogo: rp.primaryLogo,
      primaryLink: rp.primaryLink,
      secondaryLogo: rp.secondaryLogo,
      secondaryLink: rp.secondaryLink,
      homeLink: rp.homeLink,
      brand: rp.brand,
      backgroundImage: rp.backgroundImage,
      explainerVideo: rp.explainerVideo,
      workflow: {
        type: rp.workflow.type,
        id: rp.workflow.id
      }
    },
    options: config.opencred.options,
    exchangeData: {
      ...req.exchange,
      QR: await QRCode.toDataURL(req.exchange.OID4VP)
    }
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
