const dotenv = require('dotenv');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const routes = require('./routes');
const cors = require('cors');

// Load .env file and log for debugging
const result = dotenv.config();
if (result.error) {
  console.error('Error loading .env file:', result.error);
}
console.log('Environment variables:', {
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGO_URI,
  FEE_WALLET: process.env.FEE_WALLET,
  REWARDS_WALLET_ADDRESS: process.env.REWARDS_WALLET_ADDRESS
});

const app = express();
app.use(cors()); // Enable CORS for all routes
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Mongo connected'))
  .catch((err) => console.error('Mongo connection error:', err.message));

app.use('/api', routes);

app.listen(process.env.PORT, () => console.log(`Server on ${process.env.PORT}`));