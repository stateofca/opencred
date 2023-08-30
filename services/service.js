const Model = require('../models/model');

exports.create = async () => {
  try {
    const results = await Model.create();
    return { success: true, body: results };
  } catch (error) {
    return { success: false, error: error };
  }
};

exports.read = async () => {
  try {
    const results = await Model.find();
    return { success: true, body: results };
  } catch (error) {
    return { success: false, error: error };
  }
};

exports.update = async () => {
  try {
    const results = await Model.update();
    return { success: true, body: results };
  } catch (error) {
    return { success: false, error: error };
  }
};

exports.delete = async () => {
  try {
    const results = await Model.delete();
    return { success: true, body: results };
  } catch (error) {
    return { success: false, error: error };
  }
};
