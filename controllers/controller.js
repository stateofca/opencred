import {client_id} from '../config/config.js';

export async function exchangeCodeForToken(req, res) {
  res.status(500).send('Not implemented');
}

export async function login(req, res) {
  // Validate the client_id parameter from the request
  if(req.query.client_id != client_id) {
    res.status(400).send({message: 'Unknown client_id'});
  }

  res.status(500).send({message: 'Not implemented'});
}
