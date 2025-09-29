// backend/src/models/txlog.js
const mongoose = require('mongoose');

const txLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    wallet: { type: String, index: true }, // public key string
    mode: { type: String },                // bot mode at time of action
    action: { type: String },              // 'swap' | 'distribute' | 'withdraw' | 'consolidate' | 'sellAll' | etc.
    inputMint: { type: String },
    outputMint: { type: String },
    amountSol: { type: Number },           // for swap/fee context
    txid: { type: String },
    status: { type: String, default: 'sent' }, // 'sent' | 'confirmed' | 'failed' | 'dryrun'
    error: { type: String, default: null },
  },
  { timestamps: true }
);

txLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('TxLog', txLogSchema);
