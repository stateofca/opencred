export const createExchange = async (req, res, next) => {
  // TODO do native exchange creation stuff
  req.safeContext = {};
  next();
};

export const getExchangeStatus = async (req, res) => {
  res.sendStatus(501);
  return;
};
