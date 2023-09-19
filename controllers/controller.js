import {create, del, read, update} from '../services/service.js';

export async function insertOne(req, res) {
  try {
    const results = await create();
    if(results.success != true) {
      throw new Error(results.error);
    }
    return res.send('{result}').status(200);
  } catch(error) {
    res.status(500).send(error.message);
  }
}

export async function deleteOne(req, res) {
  try {
    const results = await del();
    if(results.success != true) {
      throw new Error(results.error);
    }
    return res.send('{result}').status(200);
  } catch(error) {
    res.status(500).send(error.message);
  }
}

export async function updateOne(req, res) {
  try {
    const results = await update();
    if(results.success != true) {
      throw new Error(results.error);
    }
    return res.send('{result}').status(200);
  } catch(error) {
    res.status(500).send(error.message);
  }
}

export async function getOne(req, res) {
  try {
    const results = await read();
    if(results.success != true) {
      throw new Error(results.error);
    }
    return res.send('{result}').status(200);
  } catch(error) {
    res.status(500).send(error.message);
  }
}
