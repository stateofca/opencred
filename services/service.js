const create = async () => {
  try {
    const results = {};
    return { success: true, body: results };
  } catch (error) {
    return { success: false, error: error };
  }
};

const read = async () => {
  try {
    const results = {};
    return { success: true, body: results };
  } catch (error) {
    return { success: false, error: error };
  }
};

const update = async () => {
  try {
    const results = {};
    return { success: true, body: results };
  } catch (error) {
    return { success: false, error: error };
  }
};

const delete = async () => {
  try {
    const results = {};
    return { success: true, body: results };
  } catch (error) {
    return { success: false, error: error };
  }
};

export {
  create,
  read,
  update,
  delete,
};
