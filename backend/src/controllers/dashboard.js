// backend/src/controllers/dashboard.js
const web3 = require('@solana/web3.js');
const bs58 = require('bs58');

const User = require('../models/user');
const TxLog = require('../models/txlog');

const {
  encrypt, getKeypair, getBalance, payOutRewards, addFeeInstructions, performSwap
} = require('../services/solana');

const { startBot, stopBot } = require('../services/bot');

const TOKEN_PROGRAM_ID = new web3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/* ----------------------------- Helpers ----------------------------- */

// small concurrency limiter to avoid hammering RPC
function createLimiter(max) {
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then((v) => { active--; resolve(v); runNext(); })
      .catch((e) => { active--; reject(e); runNext(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); runNext(); });
}

// retry with backoff for 429/“Too Many Requests”
async function withRetry(fn, { tries = 5, baseDelay = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e?.message || e || '');
      const tooMany = msg.includes('429') || msg.toLowerCase().includes('too many requests') || msg.toLowerCase().includes('rate');
      lastErr = e;
      if (tooMany && i < tries - 1) {
        const delay = baseDelay * Math.pow(2, i); // 500, 1000, 2000, 4000, 8000
        console.warn('Server responded with 429 Too Many Requests.  Retrying after', `${delay}ms delay...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// 30s token-holdings cache by wallet address
const TOK_CACHE_MS = 30_000;
const tokenHoldingsCache = new Map(); // addr -> { ts:number, holdings:Array }

async function getWalletHoldings(connection, ownerPk, force = false) {
  const addr = ownerPk.toString();
  const cached = tokenHoldingsCache.get(addr);
  const now = Date.now();
  if (!force && cached && (now - cached.ts) < TOK_CACHE_MS) return cached.holdings;

  const parsed = await withRetry(
    () => connection.getParsedTokenAccountsByOwner(ownerPk, { programId: TOKEN_PROGRAM_ID })
  );

  const holdings = [];
  for (const acc of parsed.value) {
    const info = acc.account.data.parsed.info;
    const uiAmount = info.tokenAmount.uiAmount;
    if (uiAmount && uiAmount > 0) {
      holdings.push({
        mint: info.mint,
        uiAmount,
        decimals: info.tokenAmount.decimals,
      });
    }
  }
  tokenHoldingsCache.set(addr, { ts: now, holdings });
  return holdings;
}

async function getTokenUiBalance(connection, ownerPk, mintPk) {
  const { value } = await connection.getParsedTokenAccountsByOwner(ownerPk, { programId: TOKEN_PROGRAM_ID });
  let total = 0;
  for (const acc of value) {
    const info = acc.account.data.parsed.info;
    if (info.mint === mintPk.toString()) {
      total += Number(info.tokenAmount.uiAmount) || 0;
    }
  }
  return total;
}

/* ----------------------------- Overview ---------------------------- */

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

/* ----------------------------- Referrals --------------------------- */

const manageReferral = async (req, res) => {
  const { destination } = req.body;
  if (!destination) return res.status(400).json({ error: 'Destination required' });

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Enforce minimum 0.05 SOL
  const minLamports = Math.floor(0.05 * web3.LAMPORTS_PER_SOL);
  if (!user.earnedRewards || user.earnedRewards < minLamports) {
    return res.status(400).json({ error: 'Minimum claim is 0.05 SOL' });
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

/* -------------------------- Wallet management ---------------------- */

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

const removeWalletByAddress = async (req, res) => {
  const { address, confirm } = req.body;
  if (!address || confirm !== 'confirm') return res.status(400).json({ error: 'Address and confirm required' });

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

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

// keep only SUB wallets in active list
function pruneActiveWallets(user) {
  const valid = new Set();
  for (const enc of user.subWalletsEncrypted) {
    try { valid.add(getKeypair(enc).publicKey.toString()); } catch (_) {}
  }
  user.activeWallets = (user.activeWallets || []).filter(a => valid.has(a));
}

const listWallets = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);

  const wallets = [];
  try {
    if (user.sourceEncrypted) {
      const kp = getKeypair(user.sourceEncrypted);
      const bal = await withRetry(() => connection.getBalance(kp.publicKey));
      wallets.push({ type: 'source', address: kp.publicKey.toString(), balanceSOL: (bal / web3.LAMPORTS_PER_SOL).toFixed(6) });
    }
  } catch (_) {}

  for (const enc of user.subWalletsEncrypted) {
    try {
      const kp = getKeypair(enc);
      const bal = await withRetry(() => connection.getBalance(kp.publicKey));
      wallets.push({ type: 'sub', address: kp.publicKey.toString(), balanceSOL: (bal / web3.LAMPORTS_PER_SOL).toFixed(6) });
    } catch (_) {}
  }

  res.json({ wallets, active: user.activeWallets || [] });
};

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

const newDepositAddress = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.sourceEncrypted) user.subWalletsEncrypted.unshift(user.sourceEncrypted);
  const kp = web3.Keypair.generate();
  user.sourceEncrypted = encrypt(bs58.encode(kp.secretKey));
  await user.save();

  pruneActiveWallets(user); // ensure old source (now sub) isn’t accidentally active

  const pub = getKeypair(user.sourceEncrypted).publicKey.toString();
  res.json({ sourceAddress: pub });
};

const setActiveWallets = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const addresses = Array.isArray(req.body.addresses) ? req.body.addresses : [];

  const allowed = new Set();
  for (const enc of user.subWalletsEncrypted) {
    try { allowed.add(getKeypair(enc).publicKey.toString()); } catch (_) {}
  }

  user.activeWallets = addresses.filter(a => allowed.has(a));
  await user.save();
  res.json({ ok: true, active: user.activeWallets });
};

/* ------------------------------- Funds ----------------------------- */

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
    const balLamports = await withRetry(() => connection.getBalance(sub.publicKey));
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

/**
 * Sell all positions of the configured tokenMint across wallets.
 * Default: SUB wallets only. If you really want to include the deposit wallet,
 * call with { includeSource: true } in the POST body.
 */
const sellAll = async (req, res) => {
  const { includeSource = false } = req.body || {};
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.tokenMint) return res.status(400).json({ error: 'No tokenMint configured in settings' });

  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);
  const tokenMint = user.tokenMint;
  const solMint = web3.SystemProgram.programId.toString();

  // Build wallet list
  const wallets = [];
  if (includeSource && user.sourceEncrypted) {
    try { wallets.push(getKeypair(user.sourceEncrypted)); } catch (_) {}
  }
  for (const enc of user.subWalletsEncrypted) {
    try { wallets.push(getKeypair(enc)); } catch (_) {}
  }
  if (!wallets.length) return res.status(400).json({ error: 'No wallets to sell from' });

  const results = [];
  for (const kp of wallets) {
    try {
      const uiAmt = await getTokenUiBalance(connection, kp.publicKey, new web3.PublicKey(tokenMint));
      if (uiAmt > 0) {
        const txid = await performSwap(user, kp, tokenMint, solMint, uiAmt, 0.5);
        await TxLog.create({
          userId: req.userId,
          wallet: kp.publicKey.toString(),
          action: 'sell-all',
          inputMint: tokenMint,
          outputMint: solMint,
          amount: uiAmt,
          mode: 'admin',
          txid,
          status: 'confirmed',
        });
        results.push({ wallet: kp.publicKey.toString(), sold: uiAmt, txid });
      } else {
        results.push({ wallet: kp.publicKey.toString(), sold: 0, txid: null });
      }
    } catch (e) {
      await TxLog.create({
        userId: req.userId,
        wallet: kp.publicKey.toString(),
        action: 'sell-all',
        inputMint: tokenMint,
        outputMint: solMint,
        status: 'error',
        error: String(e?.message || e),
      });
      results.push({ wallet: kp.publicKey.toString(), error: String(e?.message || e) });
    }
  }

  res.json({ results });
};

/**
 * Close empty token accounts (source + sub-wallets), chunked.
 */
const closeAccounts = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);
  const wallets = [];

  if (user.sourceEncrypted) {
    try { wallets.push(getKeypair(user.sourceEncrypted)); } catch (_) {}
  }
  for (const enc of user.subWalletsEncrypted) {
    try { wallets.push(getKeypair(enc)); } catch (_) {}
  }

  let totalClosed = 0;

  for (const kp of wallets) {
    const owner = kp.publicKey;
    const parsed = await withRetry(
      () => connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID })
    );

    const empties = [];
    for (const acc of parsed.value) {
      const info = acc.account.data.parsed.info;
      if (!Number(info.tokenAmount.uiAmount)) {
        empties.push(new web3.PublicKey(acc.pubkey));
      }
    }
    if (!empties.length) continue;

    const chunk = (arr, n) => (arr.length ? [arr.slice(0, n), ...chunk(arr.slice(n), n)] : []);
    for (const part of chunk(empties, 10)) {
      const ix = part.map((acct) => new web3.TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: acct,  isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: true,  isWritable: false },
        ],
        data: Buffer.from([9]),
      }));

      const tx = new web3.Transaction().add(...ix);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.feePayer = owner;
      tx.recentBlockhash = blockhash;
      tx.sign(kp);

      try {
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        await connection.confirmTransaction(sig, 'confirmed');
        totalClosed += part.length;
      } catch (e) {
        console.error('closeAccounts chunk error:', e?.message || e);
      }
    }
  }

  res.json({ closed: totalClosed });
};

/* ------------------------- Bot + settings -------------------------- */

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

  const subAddresses = [];
  for (const enc of user.subWalletsEncrypted) {
    try { subAddresses.push(getKeypair(enc).publicKey.toString()); } catch (_) {}
  }

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
    allWallets: subAddresses,
  });
};

/* ----------------------------- Portfolio --------------------------- */

const portfolio = async (req, res) => {
  const force = String(req.query.force || '') === '1'; // optional hard refresh
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);

  // Collect wallet public keys (source + subs)
  const owners = [];
  if (user.sourceEncrypted) { try { owners.push(getKeypair(user.sourceEncrypted).publicKey); } catch (_) {} }
  for (const enc of user.subWalletsEncrypted) { try { owners.push(getKeypair(enc).publicKey); } catch (_) {} }

  // Limit concurrency to reduce 429s
  const limit = createLimiter(3);
  const results = [];

  await Promise.all(
    owners.map((pk) =>
      limit(async () => {
        try {
          const holdings = await getWalletHoldings(connection, pk, force);
          results.push({ wallet: pk.toString(), holdings });
        } catch (e) {
          console.warn('Portfolio fetch error for', pk.toString(), e?.message || e);
          results.push({ wallet: pk.toString(), holdings: [] });
        }
      })
    )
  );

  res.json(results);
};

/* ---------------------------- Activity API ------------------------- */

const getActivity = async (req, res) => {
  const { limit = 50 } = req.query;
  const docs = await TxLog.find({ userId: req.userId })
    .sort({ _id: -1 })
    .limit(Math.min(200, Number(limit) || 50))
    .lean();

  res.json(docs.map(d => ({
    ts: d._id.getTimestamp(),
    wallet: d.wallet,
    action: d.action,
    inputMint: d.inputMint,
    outputMint: d.outputMint,
    amount: d.amount,
    mode: d.mode,
    txid: d.txid,
    status: d.status,
    error: d.error,
  })));
};

/* ----------------------------- Health ------------------------------ */
/**
 * Quick system health for dashboards/monitors:
 *  - Mongo connectivity
 *  - RPC reachability
 *  - Required env flags present
 */
const health = async (_req, res) => {
  const report = { ok: true, mongo: false, rpc: false, env: {} };

  // env checks that matter for runtime
  report.env.JWT_SECRET = !!process.env.JWT_SECRET;
  report.env.SOLANA_RPC = !!process.env.SOLANA_RPC;
  report.env.EMAIL_USER = !!process.env.EMAIL_USER;
  report.env.EMAIL_PASS = !!process.env.EMAIL_PASS;

  try {
    // quick mongo check by pinging a trivial query
    await User.findOne().select('_id').lean().exec();
    report.mongo = true;
  } catch {
    report.ok = false;
  }

  try {
    const conn = new web3.Connection(process.env.SOLANA_RPC);
    await conn.getLatestBlockhash();
    report.rpc = true;
  } catch {
    report.ok = false;
  }

  res.json(report);
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
  // activity + health
  getActivity, health,
};
