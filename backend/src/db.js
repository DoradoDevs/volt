// backend/src/db.js
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

const connect = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/volt';
  await mongoose.connect(uri, {
    // sensible timeouts for local/dev
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 20000,
    maxPoolSize: 10
  });
  console.log('✅ MongoDB connected:', mongoose.connection.host);
};

const close = async () => {
  await mongoose.connection.close();
  console.log('🛑 MongoDB connection closed');
};

module.exports = { connect, close };
