// tests/db_setup.js
const mongoose = require('mongoose');
const { initializeAdminUser } = require('../config/adminSetup');
const User = require('../models/User');
const Carpool = require('../models/Carpool');
const Chat = require('../models/Chat');

const mongooseOptions = {
  serverSelectionTimeoutMS: 5000
};

module.exports.connect = async () => {
  let uri = process.env.MONGO_URI;

  // Create a unique database for every test worker to prevent collisions
  if (process.env.JEST_WORKER_ID) {
     if (uri.endsWith('/')) uri = uri.slice(0, -1);
     uri += `_${process.env.JEST_WORKER_ID}`;
  }

  await mongoose.connect(uri, mongooseOptions);
};

module.exports.clearDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
      // 1. Delete all data
      await Promise.all([
        User.deleteMany({}),
        Carpool.deleteMany({}),
        Chat.deleteMany({})
      ]);
      
      // 2. Try to recreate admin, but ignore error if he already exists
      try {
        await initializeAdminUser();
      } catch (err) {
        // If error is E11000 (Duplicate Key), ignore it. Otherwise print it.
        if (err.code !== 11000) {
            console.error('DB Cleanup Error:', err.message);
        }
      }
  }
};

module.exports.closeDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
      // Drop the unique test DB to free up space
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
  }
};