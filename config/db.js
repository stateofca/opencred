const mongoose = require('mongoose');
const { DB_URI } = require('./config');

const dbConnection = async () => {
  await mongoose
    .connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
      console.log('Database connected successfully!');
    })
    .catch((error) => {
      console.log(error);
    });
};

module.exports = dbConnection;
