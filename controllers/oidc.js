/**
 * Augment the app with middleware for OIDC that validates requests prior to
 * more in-depth processing.
 * @param {Express} app - Express app instance
 */
export default function(app) {
  app.get('/login', async (req, res, next) => {
    // Validate Redirect URI is permitted
    if(!req.query.redirect_uri) {
      res.status(400).send({message: 'redirect_uri is required'});
      return;
    } else if(req.rp?.redirectUri != req.query.redirect_uri) {
      res.status(400).send({message: 'Unknown redirect_uri'});
      return;
    }

    // Validate scope is openid only.
    if(!req.query.scope) {
      res.status(400).send({message: 'scope is required'});
      return;
    } else if(req.query.scope !== 'openid') {
      res.status(400).send({message: 'Invalid scope'});
      return;
    }

    next();
  });
}
