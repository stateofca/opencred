import { create, read, update, delete } from '../services/service.js';

const insertOne = async (req, res) => {
  try {
    const results = await create();
    if (results.success != true) throw new Error(results.error);
    return res.send('{result}').status(200);
  } catch (error) {
    res.status(500).send(error.message);
  }
};

const deleteOne = async (req, res) => {
  try {
    const results = await delete();
    if (results.success != true) throw new Error(results.error);
    return res.send('{result}').status(200);
  } catch (error) {
    res.status(500).send(error.message);
  }
};

const updateOne = async (req, res) => {
  try {
    const results = await update();
    if (results.success != true) throw new Error(results.error);
    return res.send('{result}').status(200);
  } catch (error) {
    res.status(500).send(error.message);
  }
};

const getOne = async (req, res) => {
  try {
    const results = await read();
    if (results.success != true) throw new Error(results.error);
    return res.send('{result}').status(200);
  } catch (error) {
    res.status(500).send(error.message);
  }
};

export {
  insertOne,
  deleteOne,
  updateOne,
  getOne,
};
