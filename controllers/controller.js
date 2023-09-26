import {relyingParties} from '../config/config.js';

export async function exchangeCodeForToken(req, res) {
  res.status(500).send('Not implemented');
}

export async function login(req, res) {
  // Validate the client_id parameter from the request

  // If the client_id is not in the relyingParties array, throw an error
  if(!relyingParties.map(rp => rp.client_id).includes(req.query.client_id)) {
    res.status(400).send({message: 'Unknown client_id'});
  }

  res.status(500).send({message: 'Not implemented'});
}
