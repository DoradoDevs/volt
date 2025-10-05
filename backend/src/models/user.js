// backend/src/models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, default: '' }, // Custom display name (optional)

    // auth
    verificationCode: { type: String },
    verificationCodeExpires: { type: Date },
    verified: { type: Boolean, default: false },

    // referrals & tiers
    referralCode: { type: String, required: true },
    referrer: { type: String, default: null }, // userId of referrer
    earnedRewards: { type: Number, default: 0 }, // lamports
    tier: { type: String, default: 'unranked' }, // unranked/bronze/silver/gold/diamond
    volume: { type: Number, default: 0 }, // cumulative SOL (float)

    // wallets
    sourceEncrypted: { type: String, default: null }, // deposit wallet (NEVER used by bot)
    subWalletsEncrypted: { type: [String], default: [] }, // encrypted bs58 secret keys
    activeWallets: { type: [String], default: [] }, // list of ADDRESSES (sub wallets only)

    // bot settings
    tokenMint: { type: String, default: '' },
    rpc: { type: String, default: '' }, // fallback to SOLANA_RPC when blank
    minBuy: { type: Number, default: 0 },
    maxBuy: { type: Number, default: 0 },
    minDelay: { type: Number, default: 0 },
    maxDelay: { type: Number, default: 0 },
    mode: { type: String, default: 'pure' },
    running: { type: Boolean, default: false },

  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
