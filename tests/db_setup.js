// tests/db_setup.js
const mongoose = require('mongoose');
const { initializeAdminUser } = require('../config/adminSetup');
const User = require('../models/User');
const Carpool = require('../models/Carpool');
const Chat = require('../models/Chat');

const mongooseOptions = {
  serverSelectionTimeoutMS: 5000 // Wait up to 5 seconds
};

module.exports.connect = async () => {
  // 1. Connect the test runner's Mongoose instance
  // We use process.env.MONGO_URI set by the preset
  await mongoose.connect(process.env.MONGO_URI, mongooseOptions);
};
// Clear the database and re-create admin user
module.exports.clearDatabase = async () => {
  // 1. Clear all models
  await Promise.all([
    User.deleteMany(),
    Carpool.deleteMany(),
    Chat.deleteMany()
  ]);
  
  // 2. Re-create the admin user
  await initializeAdminUser();
};

module.exports.closeDatabase = async () => {
  // 1. Disconnect the test runner's Mongoose instance
  await mongoose.disconnect();
};
