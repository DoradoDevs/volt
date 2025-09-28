// backend/src/controllers/dashboard.js
const web3 = require('@solana/web3.js');
const bs58 = require('bs58');

const User = require('../models/user');
const {
  encrypt, getKeypair, getBalance, payOutRewards, addFeeInstructions
} = require('../services/solana');
const { startBot, stopBot } = require('../services/bot');

const TOKEN_PROGRAM_ID = new web3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/** ---------- Overview ---------- */
const getDashboard = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  let sourceAddress = '';
  let sourceBalance = 0;
  try {
    if (user.sourceEncrypted) {
      const kp = getKeypair(user.sourceEncrypted);
      sourceAddress = kp.publicKey.toString();
      sourceBalance = await getBalance(sourceAddress, user.rpc);
    }
  } catch (_) {}

  res.json({
    email: user.email,
    tier: user.tier,
    referralCode: user.referralCode,
    earnedRewards: (user.earnedRewards || 0) / web3.LAMPORTS_PER_SOL,
    sourceAddress,
    sourceBalance,
    subWallets: user.subWalletsEncrypted.length,
    running: !!user.running
  });
};

/** ---------- Referrals ---------- */
const manageReferral = async (req, res) => {
  const { destination } = req.body;
  if (!destination) return res.status(400).json({ error: 'Destination required' });

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.earnedRewards || user.earnedRewards === 0) {
    return res.status(400).json({ error: 'No rewards' });
  }

  const txid = await payOutRewards({
    lamports: user.earnedRewards,
    destination,
    rpc: user.rpc
  });

  user.earnedRewards = 0;
  await user.save();
  res.json({ txid });
};

const getTier = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ tier: user.tier });
};

/** ---------- Wallet management ---------- */
// Legacy bulk add/remove by count (kept for API compatibility)
const manageWallets = async (req, res) => {
  const { action, count = 0, confirm } = req.body;
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (action === 'add' && user.subWalletsEncrypted.length + count <= 100) {
    for (let i = 0; i < count; i++) {
      const kp = web3.Keypair.generate();
      user.subWalletsEncrypted.push(encrypt(bs58.encode(kp.secretKey)));
    }
  } else if (action === 'remove' && confirm === 'confirm') {
    user.subWalletsEncrypted.splice(0, Math.min(count, user.subWalletsEncrypted.length));
    pruneActiveWallets(user);
  } else {
    return res.status(400).json({ error: 'Invalid wallet action' });
  }

  await user.save();
  res.json({ message: 'Wallets updated', total: user.subWalletsEncrypted.length });
};

// NEW: add a single sub-wallet
const addOneWallet = async (_req, res) => {
  const user = await User.findById(_req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.subWalletsEncrypted.length >= 100) return res.status(400).json({ error: 'Max 100 sub-wallets' });

  const kp = web3.Keypair.generate();
  user.subWalletsEncrypted.push(encrypt(bs58.encode(kp.secretKey)));
  await user.save();

  const address = kp.publicKey.toString();
  res.json({ address });
};

// NEW: remove a single sub-wallet by address
const removeWalletByAddress = async (req, res) => {
  const { address, confirm } = req.body;
  if (!address || confirm !== 'confirm') return res.status(400).json({ error: 'Address and confirm required' });

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // only remove from sub-wallets; never remove source here
  let removed = false;
  user.subWalletsEncrypted = (user.subWalletsEncrypted || []).filter((enc) => {
    try {
      const pk = getKeypair(enc).publicKey.toString();
      if (pk === address) { removed = true; return false; }
      return true;
    } catch (_) { return true; }
  });

  if (!removed) return res.status(404).json({ error: 'Sub-wallet not found' });

  pruneActiveWallets(user);
  await user.save();
  res.json({ ok: true });
};

// helper to sync activeWallets with real wallets
function pruneActiveWallets(user) {
  const valid = new Set();
  // NOTE: deposit (source) is intentionally NOT valid for activeWallets
  for (const enc of user.subWalletsEncrypted) {
    try { valid.add(getKeypair(enc).publicKey.toString()); } catch (_) {}
  }
  user.activeWallets = (user.activeWallets || []).filter(a => valid.has(a));
}

// list wallets + SOL balances (source + subs)
const listWallets = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);

  const wallets = [];
  try {
    if (user.sourceEncrypted) {
      const kp = getKeypair(user.sourceEncrypted);
      const bal = await connection.getBalance(kp.publicKey);
      wallets.push({ type: 'source', address: kp.publicKey.toString(), balanceSOL: (bal / web3.LAMPORTS_PER_SOL).toFixed(6) });
    }
  } catch (_) {}

  for (const enc of user.subWalletsEncrypted) {
    try {
      const kp = getKeypair(enc);
      const bal = await connection.getBalance(kp.publicKey);
      wallets.push({ type: 'sub', address: kp.publicKey.toString(), balanceSOL: (bal / web3.LAMPORTS_PER_SOL).toFixed(6) });
    } catch (_) {}
  }

  res.json({ wallets, active: user.activeWallets || [] });
};

// ensure + return deposit address
const getDepositAddress = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (!user.sourceEncrypted) {
    const kp = web3.Keypair.generate();
    user.sourceEncrypted = encrypt(bs58.encode(kp.secretKey));
    await user.save();
  }
  const pub = getKeypair(user.sourceEncrypted).publicKey.toString();
  res.json({ sourceAddress: pub });
};

// rotate deposit address (old source becomes a sub-wallet)
const newDepositAddress = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.sourceEncrypted) user.subWalletsEncrypted.unshift(user.sourceEncrypted);
  const kp = web3.Keypair.generate();
  user.sourceEncrypted = encrypt(bs58.encode(kp.secretKey));
  await user.save();

  const pub = getKeypair(user.sourceEncrypted).publicKey.toString();
  res.json({ sourceAddress: pub });
};

// choose which wallets the bot uses (SUB wallets only)
const setActiveWallets = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const addresses = Array.isArray(req.body.addresses) ? req.body.addresses : [];

  // Allowed = only SUB wallets (exclude deposit/source)
  const allowed = new Set();
  for (const enc of user.subWalletsEncrypted) {
    try { allowed.add(getKeypair(enc).publicKey.toString()); } catch (_) {}
  }

  user.activeWallets = addresses.filter(a => allowed.has(a));
  await user.save();
  res.json({ ok: true, active: user.activeWallets });
};

/** ---------- Funds ---------- */
const depositWithdraw = async (req, res) => {
  let { action, amount, destination } = req.body;
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Ensure source exists
  if (!user.sourceEncrypted) {
    const kp = web3.Keypair.generate();
    user.sourceEncrypted = encrypt(bs58.encode(kp.secretKey));
    await user.save();
  }

  const sourceKp = getKeypair(user.sourceEncrypted);
  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);

  if (action === 'deposit') {
    return res.json({ sourceAddress: sourceKp.publicKey.toString() });
  }
  if (action !== 'withdraw') return res.status(400).json({ error: 'Invalid action' });
  if (!destination) return res.status(400).json({ error: 'Destination required' });

  if (amount === 'MAX') {
    amount = await getBalance(sourceKp.publicKey.toString(), user.rpc);
  }
  amount = Number(amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  const tx = new web3.Transaction().add(
    web3.SystemProgram.transfer({
      fromPubkey: sourceKp.publicKey,
      toPubkey: new web3.PublicKey(destination),
      lamports: Math.floor(amount * web3.LAMPORTS_PER_SOL)
    })
  );

  const v0 = await connection.compileMessageV0({
    payerKey: sourceKp.publicKey,
    instructions: tx.instructions,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  });
  const vtx = new web3.VersionedTransaction(v0);
  vtx.sign([sourceKp]);
  const serialized = vtx.serialize();

  const withFee = await addFeeInstructions(serialized, sourceKp, amount, user, connection);
  const sig = await connection.sendRawTransaction(withFee, { skipPreflight: true });
  await connection.confirmTransaction(sig, 'confirmed');

  res.json({ txid: sig });
};

const distribute = async (req, res) => {
  const { amountPerWallet } = req.body;
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const sourceKp = getKeypair(user.sourceEncrypted);
  const subKps = user.subWalletsEncrypted.map(getKeypair);
  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);

  if (!subKps.length) return res.status(400).json({ error: 'No sub wallets' });

  const tx = new web3.Transaction();
  subKps.forEach((sub) => {
    tx.add(web3.SystemProgram.transfer({
      fromPubkey: sourceKp.publicKey,
      toPubkey: sub.publicKey,
      lamports: Math.floor(amountPerWallet * web3.LAMPORTS_PER_SOL)
    }));
  });

  const v0 = await connection.compileMessageV0({
    payerKey: sourceKp.publicKey,
    instructions: tx.instructions,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  });
  const vtx = new web3.VersionedTransaction(v0);
  vtx.sign([sourceKp]);
  const serialized = vtx.serialize();

  const totalSol = amountPerWallet * subKps.length;
  const withFee = await addFeeInstructions(serialized, sourceKp, totalSol, user, connection);
  const sig = await connection.sendRawTransaction(withFee, { skipPreflight: true });
  await connection.confirmTransaction(sig, 'confirmed');

  res.json({ txid: sig });
};

const consolidate = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const sourceKp = getKeypair(user.sourceEncrypted);
  const subKps = user.subWalletsEncrypted.map(getKeypair);
  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);

  let total = 0;
  const tx = new web3.Transaction();

  for (const sub of subKps) {
    const balLamports = await connection.getBalance(sub.publicKey);
    if (balLamports > 0) {
      tx.add(web3.SystemProgram.transfer({
        fromPubkey: sub.publicKey,
        toPubkey: sourceKp.publicKey,
        lamports: balLamports
      }));
      total += balLamports / web3.LAMPORTS_PER_SOL;
    }
  }

  if (!tx.instructions.length) return res.json({ txid: null, message: 'Nothing to consolidate' });

  const v0 = await connection.compileMessageV0({
    payerKey: sourceKp.publicKey,
    instructions: tx.instructions,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  });
  const vtx = new web3.VersionedTransaction(v0);
  vtx.sign([sourceKp]);
  const serialized = vtx.serialize();

  const withFee = await addFeeInstructions(serialized, sourceKp, total, user, connection);
  const sig = await connection.sendRawTransaction(withFee, { skipPreflight: true });
  await connection.confirmTransaction(sig, 'confirmed');

  res.json({ txid: sig });
};

const sellAll = async (_req, res) => res.json({ message: 'Sell-all not implemented yet' });
const closeAccounts = async (_req, res) => res.json({ message: 'Close token accounts not implemented yet' });

/** ---------- Bot + settings ---------- */
const startBotController = async (req, res) => { await startBot(req.userId); res.json({ message: 'Bot started' }); };
const stopBotController = async (req, res) => { await stopBot(req.userId); res.json({ message: 'Bot stopped' }); };

const updateSettings = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const fields = ['tokenMint', 'rpc', 'minBuy', 'maxBuy', 'minDelay', 'maxDelay', 'mode'];
  for (const f of fields) if (typeof req.body[f] !== 'undefined') user[f] = req.body[f];
  await user.save();
  res.json({ message: 'Updated' });
};

const getSettings = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // IMPORTANT: expose ONLY SUB wallets to the picker; never include deposit/source
  const subAddresses = [];
  for (const enc of user.subWalletsEncrypted) {
    try { subAddresses.push(getKeypair(enc).publicKey.toString()); } catch (_) {}
  }

  // Also make sure any existing activeWallets are trimmed to sub-wallets only
  const allowed = new Set(subAddresses);
  user.activeWallets = (user.activeWallets || []).filter(a => allowed.has(a));
  await user.save();

  res.json({
    tokenMint: user.tokenMint || '',
    rpc: user.rpc || '',
    minBuy: user.minBuy || 0,
    maxBuy: user.maxBuy || 0,
    minDelay: user.minDelay || 0,
    maxDelay: user.maxDelay || 0,
    mode: user.mode || 'pure',
    running: !!user.running,
    activeWallets: user.activeWallets || [],
    allWallets: subAddresses, // <-- sub wallets only
  });
};

/** ---------- Portfolio ---------- */
const portfolio = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);

  const results = [];
  const allEncs = [];
  if (user.sourceEncrypted) allEncs.push(user.sourceEncrypted);
  allEncs.push(...user.subWalletsEncrypted);

  for (const enc of allEncs) {
    try {
      const kp = getKeypair(enc);
      const owner = kp.publicKey;
      const parsed = await connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID });
      const holdings = [];
      for (const acc of parsed.value) {
        const info = acc.account.data.parsed.info;
        const mint = info.mint;
        const uiAmount = info.tokenAmount.uiAmount;
        const decimals = info.tokenAmount.decimals;
        if (uiAmount && uiAmount > 0) holdings.push({ mint, uiAmount, decimals });
      }
      results.push({ wallet: owner.toString(), holdings });
    } catch (_) {}
  }

  res.json(results);
};

module.exports = {
  // overview
  getDashboard,
  // referrals
  manageReferral, getTier,
  // wallets
  manageWallets, listWallets, addOneWallet, removeWalletByAddress,
  getDepositAddress, newDepositAddress, setActiveWallets,
  // funds
  depositWithdraw, distribute, consolidate, sellAll, closeAccounts,
  // bot + settings
  startBotController, stopBotController, updateSettings, getSettings,
  // portfolio
  portfolio,
};
