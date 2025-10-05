// backend/src/controllers/dashboard.js
const web3 = require('@solana/web3.js');
const bs58 = require('bs58');

const User = require('../models/user');
const TxLog = require('../models/txlog');

const {
  encrypt, getKeypair, getBalance, payOutRewards, collectPlatformFee, performSwap
} = require('../services/solana');

const { startBot, stopBot } = require('../services/bot');
const { canUserPerformAction, getTierLimits, updateUserTier } = require('../config/tiers');

const TOKEN_PROGRAM_ID = new web3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const deriveSubWalletAddresses = (user) => {
  const addresses = new Set();
  let decodeError = false;
  for (const enc of user.subWalletsEncrypted || []) {
    try {
      addresses.add(getKeypair(enc).publicKey.toBase58());
    } catch (err) {
      decodeError = true;
    }
  }
  return { addresses, decodeError };
};

const validateBotConfig = (user) => {
  const issues = [];
  const tokenMint = (user.tokenMint || '').trim();
  if (!BASE58_RE.test(tokenMint)) {
    issues.push('Token mint must be a valid base58 address.');
  }

  const { addresses: allowed, decodeError } = deriveSubWalletAddresses(user);
  if (decodeError) {
    issues.push('Failed to decrypt one or more generated wallets. Regenerate wallets.');
  }

  const active = Array.isArray(user.activeWallets) ? user.activeWallets.filter(Boolean) : [];
  if (!active.length) {
    issues.push('Select at least one active wallet for the bot.');
  } else {
    const missing = active.filter((addr) => !allowed.has(addr));
    if (missing.length) {
      issues.push('Some active wallets are not recognised. Save wallet selection again.');
    }
  }

  const minBuy = toNumber(user.minBuy);
  const maxBuy = toNumber(user.maxBuy);
  if (minBuy <= 0) {
    issues.push('Minimum buy must be greater than 0.');
  }
  if (maxBuy <= 0 || maxBuy < minBuy) {
    issues.push('Maximum buy must be greater than or equal to minimum buy.');
  }

  const minDelay = toNumber(user.minDelay);
  const maxDelay = toNumber(user.maxDelay);
  if (minDelay < 200) {
    issues.push('Minimum delay must be at least 200 ms.');
  }
  if (maxDelay < minDelay) {
    issues.push('Maximum delay must be greater than or equal to minimum delay.');
  }

  if (!user.sourceEncrypted) {
    issues.push('Deposit wallet not initialised yet. Generate a deposit address.');
  }

  return { ok: issues.length === 0, issues };
};

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

  // Update tier based on volume
  await updateUserTier(user);
  await user.save();

  let sourceAddress = '';
  let sourceBalance = 0;
  try {
    if (user.sourceEncrypted) {
      const kp = getKeypair(user.sourceEncrypted);
      sourceAddress = kp.publicKey.toString();
      sourceBalance = await getBalance(sourceAddress, user.rpc);
    }
  } catch (_) {}

  const preflight = validateBotConfig(user);
  const tierLimits = getTierLimits(user.tier);

  res.json({
    email: user.email,
    displayName: user.displayName || '',
    tier: user.tier,
    tierLimits,
    volume: user.volume || 0,
    referralCode: user.referralCode,
    earnedRewards: (user.earnedRewards || 0) / web3.LAMPORTS_PER_SOL,
    sourceAddress,
    sourceBalance,
    subWallets: user.subWalletsEncrypted.length,
    activeWallets: (user.activeWallets || []).length,
    botReady: preflight.ok,
    botIssues: preflight.issues,
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

const listReferrals = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const referrals = await User.find({ referrer: req.userId })
    .select('email volume createdAt')
    .lean();

  const data = referrals.map((ref) => ({
    userId: ref._id,
    email: ref.email,
    volume: Number(ref.volume || 0),
    since: ref.createdAt,
  }));

  res.json({ referrals: data });
};

const setReferrer = async (req, res) => {
  const rawCode = (req.body?.code || '').trim();
  if (!rawCode) return res.status(400).json({ error: 'Referral code required' });

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const code = rawCode.toLowerCase();
  if (user.referralCode.toLowerCase() === code) {
    return res.status(400).json({ error: 'Cannot use your own code' });
  }

  const refUser = await User.findOne({ referralCode: code });
  if (!refUser) return res.status(404).json({ error: 'Referral code not found' });

  user.referrer = refUser._id.toString();
  await user.save();

  res.json({ ok: true, referrerEmail: refUser.email });
};

const getTier = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  await updateUserTier(user);
  await user.save();

  const tierLimits = getTierLimits(user.tier);
  const { getAllTiers } = require('../config/tiers');
  const allTiers = getAllTiers();

  res.json({
    currentTier: user.tier,
    limits: tierLimits,
    volume: user.volume || 0,
    allTiers: Object.keys(allTiers).map(key => ({
      tier: key,
      ...allTiers[key]
    }))
  });
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

  // Check tier limits
  if (!canUserPerformAction(user, 'add_wallet')) {
    const tierLimits = getTierLimits(user.tier);
    return res.status(403).json({
      error: `Wallet limit reached for ${tierLimits.name} tier (${tierLimits.maxWallets} max). Trade more volume to upgrade!`
    });
  }

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

  if (user.sourceEncrypted) {
    try {
      const kp = getKeypair(user.sourceEncrypted);
      let lamports = 0;
      try {
        lamports = await withRetry(() => connection.getBalance(kp.publicKey));
      } catch (err) {
        console.warn('wallet list: deposit balance failed', err?.message || err);
      }
      wallets.push({
        type: 'source',
        address: kp.publicKey.toString(),
        balanceSOL: (lamports / web3.LAMPORTS_PER_SOL).toFixed(6),
      });
    } catch (err) {
      console.warn('wallet list: deposit decode failed', err?.message || err);
    }
  }

  for (const enc of user.subWalletsEncrypted) {
    try {
      const kp = getKeypair(enc);
      let lamports = 0;
      try {
        lamports = await withRetry(() => connection.getBalance(kp.publicKey));
      } catch (err) {
        console.warn('wallet list: sub balance failed', err?.message || err);
      }
      wallets.push({
        type: 'sub',
        address: kp.publicKey.toString(),
        balanceSOL: (lamports / web3.LAMPORTS_PER_SOL).toFixed(6),
      });
    } catch (err) {
      console.warn('wallet list: sub decode failed', err?.message || err);
    }
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

  const validAddresses = addresses.filter(a => allowed.has(a));

  // Check tier limits for active wallets
  if (!canUserPerformAction(user, 'set_active_wallets', validAddresses)) {
    const tierLimits = getTierLimits(user.tier);
    return res.status(403).json({
      error: `Too many active wallets for ${tierLimits.name} tier. Max ${tierLimits.maxActiveWallets} wallets can be active.`
    });
  }

  user.activeWallets = validAddresses;
  await user.save();
  res.json({ ok: true, active: user.activeWallets });
};

/* ------------------------------- Funds ----------------------------- */

const depositWithdraw = async (req, res) => {
  let { action, amount, destination } = req.body;
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

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

  const lamports = Math.floor(amount * web3.LAMPORTS_PER_SOL);
  const tx = new web3.Transaction().add(
    web3.SystemProgram.transfer({
      fromPubkey: sourceKp.publicKey,
      toPubkey: new web3.PublicKey(destination),
      lamports
    })
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = sourceKp.publicKey;
  tx.sign(sourceKp);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

  let feeTxid = null;
  try {
    feeTxid = await collectPlatformFee({ connection, signer: sourceKp, user, amountSol: amount });
  } catch (feeErr) {
    console.error('[fees] withdraw fee failed:', feeErr?.message || feeErr);
  }

  res.json({ txid: sig, feeTxid });
};

const distribute = async (req, res) => {
  const { amountPerWallet } = req.body;
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const perWallet = Number(amountPerWallet);
  if (!Number.isFinite(perWallet) || perWallet <= 0) {
    return res.status(400).json({ error: 'Invalid amount per wallet' });
  }

  const sourceKp = getKeypair(user.sourceEncrypted);
  const subKps = user.subWalletsEncrypted.map(getKeypair);
  if (!subKps.length) return res.status(400).json({ error: 'No sub wallets' });

  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);
  const perWalletLamports = Math.floor(perWallet * web3.LAMPORTS_PER_SOL);
  const totalLamports = perWalletLamports * subKps.length;

  const currentBalance = await withRetry(() => connection.getBalance(sourceKp.publicKey));
  if (currentBalance < totalLamports) {
    return res.status(400).json({ error: 'Insufficient balance in source wallet' });
  }

  const instructions = subKps.map((sub) =>
    web3.SystemProgram.transfer({
      fromPubkey: sourceKp.publicKey,
      toPubkey: sub.publicKey,
      lamports: perWalletLamports,
    })
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const messageV0 = new web3.TransactionMessage({
    payerKey: sourceKp.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const vtx = new web3.VersionedTransaction(messageV0);
  vtx.sign([sourceKp]);

  const sig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: true });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

  let feeTxid = null;
  try {
    feeTxid = await collectPlatformFee({ connection, signer: sourceKp, user, amountSol: perWallet * subKps.length });
  } catch (feeErr) {
    console.error('[fees] distribute fee failed:', feeErr?.message || feeErr);
  }

  res.json({ txid: sig, feeTxid });
};

const consolidate = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const sourceKp = getKeypair(user.sourceEncrypted);
  const subKps = user.subWalletsEncrypted.map(getKeypair);
  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);

  const txids = [];
  const results = [];
  let totalLamports = 0;

  // Fee buffer: typical Solana transfer fee is ~5000 lamports
  const FEE_BUFFER = 5000;
  const MIN_BALANCE = 10000; // minimum balance to bother consolidating

  for (const sub of subKps) {
    const walletAddr = sub.publicKey.toString();
    try {
      const balanceLamports = await withRetry(() => connection.getBalance(sub.publicKey));

      if (balanceLamports <= MIN_BALANCE) {
        results.push({ wallet: walletAddr, status: 'skipped', reason: 'balance too low', balance: balanceLamports });
        continue;
      }

      // Reserve SOL for transaction fee
      const transferAmount = balanceLamports - FEE_BUFFER;

      if (transferAmount <= 0) {
        results.push({ wallet: walletAddr, status: 'skipped', reason: 'insufficient for fee', balance: balanceLamports });
        continue;
      }

      const tx = new web3.Transaction().add(web3.SystemProgram.transfer({
        fromPubkey: sub.publicKey,
        toPubkey: sourceKp.publicKey,
        lamports: transferAmount
      }));
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = sub.publicKey;
      tx.sign(sub);

      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      txids.push(sig);
      totalLamports += transferAmount;
      results.push({ wallet: walletAddr, status: 'success', txid: sig, transferred: transferAmount });
      console.log(`[consolidate] ${walletAddr}: transferred ${transferAmount} lamports (${(transferAmount/web3.LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
    } catch (err) {
      const errMsg = err?.message || String(err);
      console.error(`[consolidate] ${walletAddr} failed:`, errMsg);
      results.push({ wallet: walletAddr, status: 'failed', error: errMsg });
    }
  }

  if (!txids.length) {
    return res.json({ txid: null, txids: [], results, message: 'Nothing to consolidate' });
  }

  let feeTxid = null;
  const totalSol = totalLamports / web3.LAMPORTS_PER_SOL;
  try {
    feeTxid = await collectPlatformFee({ connection, signer: sourceKp, user, amountSol: totalSol });
  } catch (feeErr) {
    console.error('[fees] consolidate fee failed:', feeErr?.message || feeErr);
  }

  res.json({ txid: txids[0], txids, feeTxid, totalSol, results });
};

const sellAll = async (req, res) => {
  const { includeSource = false } = req.body || {};
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.tokenMint) return res.status(400).json({ error: 'No tokenMint configured in settings' });

  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);
  const tokenMint = user.tokenMint;
  const solMint = SOL_MINT;

  const wallets = [];
  if (includeSource && user.sourceEncrypted) {
    try { wallets.push(getKeypair(user.sourceEncrypted)); } catch (e) { console.warn('sellAll source decode failed', e?.message || e); }
  }
  for (const enc of user.subWalletsEncrypted) {
    try { wallets.push(getKeypair(enc)); } catch (e) { console.warn('sellAll sub decode failed', e?.message || e); }
  }
  if (!wallets.length) return res.status(400).json({ error: 'No wallets to sell from' });

  const results = [];
  for (const kp of wallets) {
    try {
      const uiAmt = await getTokenUiBalance(connection, kp.publicKey, new web3.PublicKey(tokenMint));
      if (uiAmt > 0) {
        const swap = await performSwap(user, kp, tokenMint, solMint, uiAmt, 0.5, { action: 'sell-all', mode: 'admin' });
        const txid = swap?.txid || null;
        const volumeSol = swap?.volumeSol || 0;
        await TxLog.create({
          userId: req.userId,
          wallet: kp.publicKey.toString(),
          action: 'sell-all',
          inputMint: tokenMint,
          outputMint: solMint,
          amountSol: volumeSol,
          mode: 'admin',
          txid,
          status: txid ? 'confirmed' : 'sent',
        });
        results.push({ wallet: kp.publicKey.toString(), sold: uiAmt, txid, volumeSol });
      } else {
        results.push({ wallet: kp.publicKey.toString(), sold: 0, txid: null, volumeSol: 0 });
      }
    } catch (e) {
      await TxLog.create({
        userId: req.userId,
        wallet: kp.publicKey.toString(),
        action: 'sell-all',
        inputMint: tokenMint,
        outputMint: solMint,
        amountSol: 0,
        status: 'failed',
        error: String(e?.message || e),
      });
      results.push({ wallet: kp.publicKey.toString(), error: String(e?.message || e) });
    }
  }

  res.json({ results });
};

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

const startBotController = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const preflight = validateBotConfig(user);
  if (!preflight.ok) {
    return res.status(400).json({ error: 'Bot configuration incomplete', issues: preflight.issues });
  }

  try {
    const { status } = await startBot(user._id);
    const messageMap = {
      started: 'Bot loop started',
      resumed: 'Bot resume requested',
      'already-running': 'Bot already running',
    };
    res.json({ message: messageMap[status] || 'Bot start request accepted', status });
  } catch (err) {
    console.error(`[bot ${req.userId}] start error:`, err?.message || err);
    res.status(500).json({ error: 'Failed to start bot', detail: err?.message || String(err) });
  }
};
const stopBotController = async (req, res) => {
  try {
    const { status } = await stopBot(req.userId);
    const messageMap = {
      stopping: 'Stop signal sent',
      'already-stopping': 'Bot is already stopping',
      'not-running': 'Bot was not running',
    };
    res.json({ message: messageMap[status] || 'Stop request acknowledged', status });
  } catch (err) {
    console.error(`[bot ${req.userId}] stop error:`, err?.message || err);
    res.status(500).json({ error: 'Failed to stop bot', detail: err?.message || String(err) });
  }
};

const updateSettings = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Check mode restriction
  if (req.body.mode && !canUserPerformAction(user, 'use_mode', req.body.mode)) {
    const tierLimits = getTierLimits(user.tier);
    return res.status(403).json({
      error: `Mode "${req.body.mode}" not available for ${tierLimits.name} tier. Available modes: ${tierLimits.features.botModes.join(', ')}`
    });
  }

  // Check custom RPC restriction
  if (req.body.rpc && req.body.rpc.trim() && !canUserPerformAction(user, 'use_custom_rpc')) {
    const tierLimits = getTierLimits(user.tier);
    return res.status(403).json({
      error: `Custom RPC not available for ${tierLimits.name} tier. Upgrade to Bronze or higher!`
    });
  }

  const fields = ['tokenMint', 'rpc', 'minBuy', 'maxBuy', 'minDelay', 'maxDelay', 'mode'];
  for (const f of fields) if (typeof req.body[f] !== 'undefined') user[f] = req.body[f];
  await user.save();
  res.json({ message: 'Updated' });
};

const updateDisplayName = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { displayName } = req.body;

  // Validate display name (max 50 chars, trim whitespace)
  const trimmed = String(displayName || '').trim();
  if (trimmed.length > 50) {
    return res.status(400).json({ error: 'Display name must be 50 characters or less' });
  }

  user.displayName = trimmed;
  await user.save();
  res.json({ displayName: user.displayName });
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

  const preflight = validateBotConfig(user);

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
    preflight,
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
          const solLamports = await withRetry(() => connection.getBalance(pk));
          results.push({ wallet: pk.toString(), holdings, solBalance: solLamports / web3.LAMPORTS_PER_SOL });
        } catch (e) {
          console.warn('Portfolio fetch error for', pk.toString(), e?.message || e);
          results.push({ wallet: pk.toString(), holdings: [], solBalance: 0 });
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
    amount: d.amountSol || 0,
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
  manageReferral, listReferrals, setReferrer, getTier,
  // wallets
  manageWallets, listWallets, addOneWallet, removeWalletByAddress,
  getDepositAddress, newDepositAddress, setActiveWallets,
  // funds
  depositWithdraw, distribute, consolidate, sellAll, closeAccounts,
  // bot + settings
  startBotController, stopBotController, updateSettings, updateDisplayName, getSettings,
  // portfolio
  portfolio,
  // activity + health
  getActivity, health,
};

