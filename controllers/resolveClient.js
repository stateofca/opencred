import {
  relyingParties
} from '../config/config.js';

const attachClient = async (req, res, next) => {
  if(!req.query.client_id) {
    res.status(400).send({message: 'client_id is required'});
    return;
  }
  const rp = relyingParties.find(r => r.client_id == req.query.client_id);
  if(!rp) {
    res.status(400).send({message: 'Unknown client_id'});
  }

  req.rp = rp;
  next();
};

export default function(app) {
  app.use('/login', attachClient);
  app.use('/exchange', attachClient);
  app.use('/token', attachClient);
}
