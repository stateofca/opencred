import {exchanges} from '../common/database.js';

const getAuthFunction = (basicEnabled, bearerEnabled) => {
  const ensureAuth = async (req, res, next) => {
    if(!req.rp) {
      res.status(500).send(
        {message: 'Unexpected server error: client_id was not resolved'}
      );
    }
    if(!req.headers.authorization) {
      res.status(401).send({message: 'Authorization header is required'});
      return;
    }

    const client_id = req.rp.client_id;
    const client_secret = req.rp.client_secret;

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
        authValueParts[0] !== client_id ||
        authValueParts[1] !== client_secret
      ) {
        res.status(401).send(
          {message: 'Malformed token or invalid client_id or client_secret'}
        );
        return;
      }
    } else if(bearerEnabled && parts[0] == 'Bearer') {
      const exchange = await exchanges.findOne({accessToken: parts[1]});
      if(!exchange?.challenge || exchange.workflowId !== req.rp.workflow.id) {
        res.status(401).send({message: 'Invalid token'});
        return;
      }
      // If we've looked it up this way, we don't need to do it again later
      req.exchange = exchange;
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
 * that encodes the client_id and client_secret with HTTP Basic Auth
 * @param {Express} app - Express app instance
 */
export default function(app) {
  app.post('/workflows/:workflowId/exchanges', getAuthFunction(true, false));
  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId', getAuthFunction(true, true)
  );
  app.post('/token', getAuthFunction(true, false));
}
