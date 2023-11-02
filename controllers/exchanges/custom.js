export default function(app) {
  app.get('/login', async (req, res, next) => {
    const rp = req.rp;
    if(!rp || !rp.workflow || rp.workflow.type !== 'custom') {
      next();
      return;
    }

    res.sendStatus(501);
    return;
  });

  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId',
    async (req, res, next) => {
      const rp = req.rp;
      if(!rp || !rp.workflow || rp.workflow.type !== 'custom') {
        next();
        return;
      }

      res.sendStatus(501);
      return;
    });
}
