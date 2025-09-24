const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true },
  verificationCode: { type: String },
  verificationCodeExpires: { type: Date },      // NEW: expiry
  tier: { type: String, default: 'unranked' },
  volume: { type: Number, default: 0 },
  referralCode: { type: String, required: true },
  referrer: { type: String, default: null },
  earnedRewards: { type: Number, default: 0 },
  subWalletsEncrypted: { type: [String], default: [] },
  running: { type: Boolean, default: false },
  verified: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
