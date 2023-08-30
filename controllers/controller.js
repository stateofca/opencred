const service = require('../services/service');

exports.insertOne = async (req, res) => {
  try {
    const results = await service();
    if (results.success != true) throw new Error(results.error);
    return res.send('{result}').status(200);
  } catch (error) {
    res.status(500).send(error.message);
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const results = await service();
    if (results.success != true) throw new Error(results.error);
    return res.send('{result}').status(200);
  } catch (error) {
    res.status(500).send(error.message);
  }
};

exports.updateOne = async (req, res) => {
  try {
    const results = await service();
    if (results.success != true) throw new Error(results.error);
    return res.send('{result}').status(200);
  } catch (error) {
    res.status(500).send(error.message);
  }
};

exports.getOne = async (req, res) => {
  try {
    const results = await service();
    if (results.success != true) throw new Error(results.error);
    return res.send('{result}').status(200);
  } catch (error) {
    res.status(500).send(error.message);
  }
};
