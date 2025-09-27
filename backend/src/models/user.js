const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // identity
  email: { type: String, required: true, unique: true, index: true },
  verified: { type: Boolean, default: false },

  // verification
  verificationCode: { type: String },
  verificationCodeExpires: { type: Date },

  // referral/tier/volume
  tier: { type: String, default: 'unranked' }, // unranked|bronze|silver|gold|diamond
  volume: { type: Number, default: 0 },        // in SOL
  referralCode: { type: String, required: true },
  referrer: { type: String, default: null },
  earnedRewards: { type: Number, default: 0 }, // lamports

  // wallets + settings
  sourceEncrypted: { type: String, default: null },     // primary deposit wallet (encrypted)
  subWalletsEncrypted: { type: [String], default: [] }, // encrypted sub-wallets
  activeWallets: { type: [String], default: [] },       // list of ADDRESSES the bot should use
  rpc: { type: String, default: null },
  tokenMint: { type: String, default: '' },
  minBuy: { type: Number, default: 0 },
  maxBuy: { type: Number, default: 0 },
  minDelay: { type: Number, default: 0 },
  maxDelay: { type: Number, default: 0 },
  mode: { type: String, default: 'pure' },

  running: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
