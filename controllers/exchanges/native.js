export default function(app) {
  app.use('/login', async (req, res) => {
    res.sendStatus(501);
    return;
  });

  app.use('/exchange', async (req, res) => {
    res.sendStatus(501);
    return;
  });
}
