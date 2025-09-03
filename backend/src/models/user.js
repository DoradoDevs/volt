const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  passwordHash: String,
  verificationCode: String,
  tier: { type: String, default: 'unranked' },  // unranked, bronze, etc.
  volume: { type: Number, default: 0 },  // SOL volume
  referralCode: String,
  referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  earnedRewards: { type: Number, default: 0 },  // Lamports
  sourceEncrypted: String,  // Encrypted base58 PK
  subWalletsEncrypted: [String],  // Array of encrypted base58 PKs
  rpc: String,
  tokenMint: String,
  minBuy: Number,
  maxBuy: Number,
  minDelay: Number,
  maxDelay: Number,
  mode: String,  // pure, growth, etc.
  running: { type: Boolean, default: false },
});

module.exports = mongoose.model('User', userSchema);