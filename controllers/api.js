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

export const getExchangeStatus = async (req, res) => {
  res.send({exchange: req.exchange});
};

