export default function(app) {
  app.use('/login', async (req, res, next) => {
    const rp = req.rp;
    if(!rp || !rp.workflow || rp.workflow.type !== 'custom') {
      next();
      return;
    }

    res.sendStatus(501);
    return;
  });

  app.use('/exchange', async (req, res, next) => {
    const rp = req.rp;
    if(!rp || !rp.workflow || rp.workflow.type !== 'custom') {
      next();
      return;
    }

    res.sendStatus(501);
    return;
  });
}
