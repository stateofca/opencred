import {getExchange} from './exchanges/native.js';

const getAuthFunction = (basicEnabled, bearerEnabled) => {
  const ensureAuth = async (req, res, next) => {
    if(!req.rp) {
      res.status(500).send(
        {message: 'Unexpected server error: clientId was not resolved'}
      );
    }
    if(!req.headers.authorization) {
      res.status(401).send({message: 'Authorization header is required'});
      return;
    }

    const clientId = req.rp.clientId;
    const clientSecret = req.rp.clientSecret;

    const authHeader = req.headers.authorization;
    const parts = authHeader.split(' ');
    if(parts.length !== 2) {
      res.status(401).send(
        {message: 'Invalid Authorization format. Basic or Bearer required'}
      );
      return;
    } else if(basicEnabled && parts[0] == 'Basic') {
      const val = Buffer.from(parts[1], 'base64').toString('utf-8');
      const authValueParts = val.split(':');
      if(
        authValueParts.length !== 2 ||
        authValueParts[0] !== clientId ||
        authValueParts[1] !== clientSecret
      ) {
        res.status(401).send(
          {message: 'Malformed token or invalid clientId or clientSecret'}
        );
        return;
      }
    } else if(bearerEnabled && parts[0] == 'Bearer') {
      const exchange = await getExchange(req.params.exchangeId, {
        others: {accessToken: parts[1]}, allowExpired: true
      });
      if(!exchange) {
        res.status(404).send({message: 'Exchange not found'});
        return;
      }
      if(!exchange?.challenge || exchange.workflowId !== req.rp.workflow.id) {
        res.status(401).send({message: 'Invalid token'});
        return;
      }
    } else {
      res.status(401).send(
        {message: 'Invalid Authorization header format. Basic auth required'}
      );
      return;
    }

    next();
  };
  return ensureAuth;
};

/**
 * Augments the app to verify an authentication header is present for
 * protected routes. The header must contain a valid Aurhorization header
 * that encodes the client_id and clientSecret with HTTP Basic Auth
 * @param {Express} app - Express app instance
 */
export default function(app) {
  app.post('/workflows/:workflowId/exchanges', getAuthFunction(true, false));
  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId', getAuthFunction(true, true)
  );
  app.post('/token', getAuthFunction(true, false));
}
