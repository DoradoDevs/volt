const web3 = require('@solana/web3.js');
const { createJupiterApiClient } = require('@jup-ag/api');
const CryptoJS = require('crypto-js');
const mongoose = require('mongoose');
const bs58 = require('bs58');

const User = require('../models/user');
const TxLog = require('../models/txlog');

const SOL_MINT = "So11111111111111111111111111111111111111112";

let FEE_WALLET;
let REWARDS_WALLET;
let REWARDS_KEYPAIR;
let ENCRYPTION_SECRET;
let DEFAULT_RPC;
let FEE_RATE;
let REBATE_ADDRESS;
let FORCE_REBATE;
let DEFAULT_PRIORITY_FEE = 0;

const initializeEnvironment = () => {
  if (!process.env.FEE_WALLET) throw new Error('FEE_WALLET not set');
  if (!process.env.REWARDS_WALLET_ADDRESS) throw new Error('REWARDS_WALLET_ADDRESS not set');
  if (!process.env.REWARDS_PRIVATE_KEY) throw new Error('REWARDS_PRIVATE_KEY not set');
  if (!process.env.ENCRYPTION_SECRET) throw new Error('ENCRYPTION_SECRET not set');
  if (!process.env.SOLANA_RPC) throw new Error('SOLANA_RPC not set');

  FEE_WALLET = new web3.PublicKey(process.env.FEE_WALLET);
  REWARDS_WALLET = new web3.PublicKey(process.env.REWARDS_WALLET_ADDRESS);
  REWARDS_KEYPAIR = web3.Keypair.fromSecretKey(bs58.decode(process.env.REWARDS_PRIVATE_KEY));
  ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
  DEFAULT_RPC = process.env.SOLANA_RPC;

  REBATE_ADDRESS = (process.env.HELIUS_REBATE_ADDRESS || process.env.REBATE_ADDRESS || '').trim() || null;
  FORCE_REBATE = String(process.env.REBATE_FORCE || '').toLowerCase() === 'true';

  const parsed = Number(process.env.FEE_RATE || 0.001);
  FEE_RATE = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.001;

  const priorityEnv = Number(process.env.SWAP_PRIORITY_LAMPORTS || process.env.PRIORITY_FEE_LAMPORTS || 0);
  DEFAULT_PRIORITY_FEE = Number.isFinite(priorityEnv) && priorityEnv > 0 ? Math.floor(priorityEnv) : 0;
};

const ensureInit = (fn) => (...args) => {
  if (!FEE_WALLET) initializeEnvironment();
  return fn(...args);
};

const decorateRpcEndpoint = (endpoint) => {
  if (!REBATE_ADDRESS) return endpoint;
  const candidate = endpoint || '';
  const lower = candidate.toLowerCase();
  const shouldAttach = FORCE_REBATE || lower.includes('helius');
  if (!shouldAttach) return candidate;

  try {
    const url = new URL(candidate);
    if (!url.searchParams.has('rebate-address')) {
      url.searchParams.append('rebate-address', REBATE_ADDRESS);
    }
    return url.toString();
  } catch (err) {
    return candidate.includes('?')
      ? `${candidate}&rebate-address=${REBATE_ADDRESS}`
      : `${candidate}?rebate-address=${REBATE_ADDRESS}`;
  }
};

const encrypt = ensureInit((text) => CryptoJS.AES.encrypt(text, ENCRYPTION_SECRET).toString());
const decrypt = ensureInit((ciphertext) => CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_SECRET).toString(CryptoJS.enc.Utf8));
const getKeypair = ensureInit((encrypted) => {
  const secret = bs58.decode(decrypt(encrypted));
  return web3.Keypair.fromSecretKey(secret);
});

const getConnection = ensureInit((rpc) => {
  const endpoint = decorateRpcEndpoint(rpc || DEFAULT_RPC);
  return new web3.Connection(endpoint, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60_000,
  });
});

const getBalance = ensureInit(async (address, rpc) => {
  const connection = getConnection(rpc);
  const lamports = await connection.getBalance(new web3.PublicKey(address));
  return lamports / web3.LAMPORTS_PER_SOL;
});

const TIER_DISCOUNTS = {
  unranked: 0,
  bronze: 0.1,
  silver: 0.2,
  gold: 0.3,
  diamond: 0.5,
};

// Additional discount for users referred by someone of each tier
const REFERRER_BONUS_DISCOUNTS = {
  unranked: 0,
  bronze: 0.025,   // 2.5% additional discount
  silver: 0.05,    // 5% additional discount
  gold: 0.075,     // 7.5% additional discount
  diamond: 0.10,   // 10% additional discount
};

const REFERRAL_SHARES = {
  unranked: 0.10,
  bronze: 0.125,
  silver: 0.15,
  gold: 0.20,
  diamond: 0.25,
};

// Multi-level referral commission rates
const MULTI_LEVEL_SHARES = {
  level1: 'tier-based',  // Use REFERRAL_SHARES based on referrer's tier
  level2: 0.10,          // 10% for referrer's referrer
  level3: 0.05,          // 5% for level 3
  level4: 0.025,         // 2.5% for level 4
};

const getTierDiscount = (tier) => TIER_DISCOUNTS[(tier || '').toLowerCase()] || 0;
const getReferrerBonusDiscount = (tier) => REFERRER_BONUS_DISCOUNTS[(tier || '').toLowerCase()] || 0;
const getReferralShare = (tier) => REFERRAL_SHARES[(tier || '').toLowerCase()] || REFERRAL_SHARES.unranked;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isResponseError = (err) => err && err.name === 'ResponseError' && err.response && typeof err.response.text === 'function';

const annotateJupiterError = async (err, label) => {
  if (!err || err.__jupAnnotated) return err;
  err.__jupAnnotated = true;
  const prefix = `[jupiter ${label}]`;

  try {
    if (isResponseError(err)) {
      const res = err.response;
      const status = res.status || res.statusCode || '';
      const statusText = res.statusText || '';
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch (_) {
        bodyText = '';
      }

      let detail = bodyText;
      if (bodyText) {
        try {
          const parsed = JSON.parse(bodyText);
          err.jupiterDetails = parsed;
          detail = parsed.error || parsed.message || parsed.details || JSON.stringify(parsed);
        } catch (_) {
          err.jupiterDetails = bodyText;
        }
      }

      err.message = [prefix, status, statusText].filter(Boolean).join(' ').trim();
      if (detail) err.message = `${err.message}${err.message ? ' - ' : ''}${detail}`;
    } else if (err?.message) {
      err.message = `${prefix} ${err.message}`;
    } else {
      err.message = `${prefix} Unknown error`;
    }
  } catch (parseErr) {
    console.warn(`${prefix} failed to read error response`, parseErr?.message || parseErr);
  }

  console.warn(err?.message || prefix);
  return err;
};

const callJupiter = async (fn, label, tries = 3, baseDelay = 300) => {
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await annotateJupiterError(err, `${label} attempt ${attempt + 1}`);
      if (attempt < tries - 1) {
        await sleep(baseDelay * Math.pow(2, attempt));
      }
    }
  }
  throw lastErr;
};

async function withRetry(fn, tries = 3, base = 250) {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) {
        await sleep(base * Math.pow(2, i));
      }
    }
  }
  throw lastErr;
}

const updateTier = async (user) => {
  const v = user.volume || 0;
  let tier = 'unranked';
  if (v > 1000) tier = 'diamond';
  else if (v > 500) tier = 'gold';
  else if (v > 250) tier = 'silver';
  else if (v > 100) tier = 'bronze';
  user.tier = tier;
  await user.save();
};

const DECIMALS_CACHE_MS = 5 * 60 * 1000;
const mintDecimalsCache = new Map();

const getMintDecimals = async (connection, mint) => {
  if (mint === SOL_MINT) return 9;
  const key = mint.toString();
  const cached = mintDecimalsCache.get(key);
  const now = Date.now();
  if (cached && (now - cached.fetched) < DECIMALS_CACHE_MS) {
    return cached.value;
  }

  const info = await withRetry(() => connection.getParsedAccountInfo(new web3.PublicKey(mint)));
  const value = info.value;
  const decimals = Number(value?.data?.parsed?.info?.decimals);
  if (!Number.isFinite(decimals)) {
    throw new Error(`Unable to resolve decimals for mint ${mint}`);
  }
  mintDecimalsCache.set(key, { value: decimals, fetched: now });
  return decimals;
};

const toBaseUnits = async (connection, mint, uiAmount) => {
  const amount = Number(uiAmount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (mint === SOL_MINT) {
    return Math.floor(amount * web3.LAMPORTS_PER_SOL);
  }
  const decimals = await getMintDecimals(connection, mint);
  return Math.floor(amount * 10 ** decimals);
};

const fromBaseUnits = async (connection, mint, rawAmount) => {
  const raw = Number(rawAmount);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (mint === SOL_MINT) {
    return raw / web3.LAMPORTS_PER_SOL;
  }
  const decimals = await getMintDecimals(connection, mint);
  return raw / 10 ** decimals;
};

let jupiterClient = null;

const getJupiter = async () => {
  if (jupiterClient) return jupiterClient;

  const basePath = (process.env.JUPITER_API_BASE || '').trim();
  const apiKey = (process.env.JUPITER_API_KEY || process.env.JUP_API_KEY || process.env.API_KEY || '').trim();
  const config = {};
  if (basePath) config.basePath = basePath;
  if (apiKey) {
    config.apiKey = apiKey;
    config.headers = { 'x-api-key': apiKey };
  }

  jupiterClient = createJupiterApiClient(config);
  return jupiterClient;
};

const computeFeeParts = async (amountSol, user) => {
  if (!amountSol || amountSol <= 0) {
    return { lamports: 0, feeToApp: 0, referralChain: [] };
  }

  const baseLamports = Math.floor(amountSol * FEE_RATE * web3.LAMPORTS_PER_SOL);
  if (baseLamports <= 0) {
    return { lamports: 0, feeToApp: 0, referralChain: [] };
  }

  // Apply user's own tier discount
  const userDiscount = getTierDiscount(user.tier);
  let effectiveLamports = Math.max(0, Math.floor(baseLamports * (1 - userDiscount)));

  // Apply referrer bonus discount if user has a referrer
  let referrerBonusApplied = 0;
  if (user.referrer) {
    const refId = normalizeReferrerId(user.referrer);
    if (refId && mongoose.Types.ObjectId.isValid(refId)) {
      try {
        const directReferrer = await User.findById(refId);
        if (directReferrer) {
          const bonusDiscount = getReferrerBonusDiscount(directReferrer.tier);
          if (bonusDiscount > 0) {
            const bonusAmount = Math.floor(effectiveLamports * bonusDiscount);
            effectiveLamports = Math.max(0, effectiveLamports - bonusAmount);
            referrerBonusApplied = bonusAmount;
          }
        }
      } catch (err) {
        console.warn('[fee] failed to load referrer for bonus discount', err?.message || err);
      }
    }
  }

  // Calculate multi-level referral chain (up to 4 levels)
  const referralChain = await buildReferralChain(user, 4);

  // Distribute fees across referral chain
  let totalReferralFees = 0;
  const feeDistribution = [];

  for (let i = 0; i < referralChain.length; i++) {
    const ref = referralChain[i];
    let feeShare = 0;

    if (i === 0) {
      // Level 1: Direct referrer gets tier-based share
      const share = getReferralShare(ref.tier);
      feeShare = Math.floor(effectiveLamports * share);
    } else if (i === 1) {
      // Level 2: 10% of fee
      feeShare = Math.floor(effectiveLamports * MULTI_LEVEL_SHARES.level2);
    } else if (i === 2) {
      // Level 3: 5% of fee
      feeShare = Math.floor(effectiveLamports * MULTI_LEVEL_SHARES.level3);
    } else if (i === 3) {
      // Level 4: 2.5% of fee
      feeShare = Math.floor(effectiveLamports * MULTI_LEVEL_SHARES.level4);
    }

    if (feeShare > 0) {
      feeDistribution.push({
        userId: ref._id,
        tier: ref.tier,
        level: i + 1,
        lamports: feeShare
      });
      totalReferralFees += feeShare;
    }
  }

  // App gets remainder after all referral fees
  const feeToApp = Math.max(0, effectiveLamports - totalReferralFees);

  return {
    lamports: effectiveLamports,
    feeToApp,
    referralChain: feeDistribution,
    referrerBonusApplied
  };
};

// Helper function to normalize referrer ID
const normalizeReferrerId = (refId) => {
  if (!refId) return null;

  if (typeof refId === 'object' && refId) {
    refId = refId._id || refId.id || (typeof refId.toString === 'function' ? refId.toString() : refId);
  }

  if (typeof refId === 'string') {
    return refId.trim();
  }

  return null;
};

// Helper function to build referral chain up to maxLevels
const buildReferralChain = async (user, maxLevels) => {
  const chain = [];
  let currentUser = user;

  for (let level = 0; level < maxLevels; level++) {
    if (!currentUser.referrer) break;

    const refId = normalizeReferrerId(currentUser.referrer);
    if (!refId || !mongoose.Types.ObjectId.isValid(refId)) break;

    try {
      const referrer = await User.findById(refId);
      if (!referrer) break;

      chain.push(referrer);
      currentUser = referrer;
    } catch (err) {
      console.warn(`[fee] failed to load referrer at level ${level + 1}`, err?.message || err);
      break;
    }
  }

  return chain;
};

const collectPlatformFee = ensureInit(async ({ connection, signer, user, amountSol }) => {
  if (!amountSol || amountSol <= 0) {
    console.log('[fee] No amount to collect fee from');
    return null;
  }

  const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
  const { lamports, feeToApp, referralChain, referrerBonusApplied } = await computeFeeParts(amountSol, user);

  // Calculate total referral fees for logging
  const totalReferralFees = referralChain.reduce((sum, ref) => sum + ref.lamports, 0);

  console.log(`[fee] Volume: ${amountSol} SOL | Total fee: ${lamports / web3.LAMPORTS_PER_SOL} SOL | To App: ${feeToApp / web3.LAMPORTS_PER_SOL} SOL | To Referrals: ${totalReferralFees / web3.LAMPORTS_PER_SOL} SOL (${referralChain.length} levels)`);
  if (referrerBonusApplied > 0) {
    console.log(`[fee] Referrer bonus discount applied: ${referrerBonusApplied / web3.LAMPORTS_PER_SOL} SOL`);
  }

  if (lamports <= 0) {
    console.log('[fee] Fee amount is 0, skipping');
    return null;
  }
  if (dryRun) {
    console.log('[fee] DRY_RUN mode, skipping actual transfer');
    return `dryrun_fee_${Date.now()}`;
  }

  const instructions = [];

  // Send referral fees to REWARDS_WALLET for each level
  if (totalReferralFees > 0) {
    console.log(`[fee] Distributing referral fees across ${referralChain.length} levels:`);
    for (const ref of referralChain) {
      console.log(`[fee]   Level ${ref.level} (${ref.tier}): ${ref.lamports / web3.LAMPORTS_PER_SOL} SOL`);
    }

    instructions.push(web3.SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: REWARDS_WALLET,
      lamports: totalReferralFees,
    }));
  }

  // Send app fees to FEE_WALLET
  if (feeToApp > 0) {
    console.log(`[fee] Adding app fee: ${feeToApp / web3.LAMPORTS_PER_SOL} SOL to ${FEE_WALLET.toBase58()}`);
    instructions.push(web3.SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: FEE_WALLET,
      lamports: feeToApp,
    }));
  }
  if (!instructions.length) {
    console.log('[fee] No instructions to send');
    return null;
  }

  const tx = new web3.Transaction().add(...instructions);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
  tx.recentBlockhash = blockhash;
  tx.feePayer = signer.publicKey;
  tx.sign(signer);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries: 3
  });

  // Use shorter timeout for confirmation
  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight
  }, 'confirmed');

  if (confirmation.value.err) {
    throw new Error(`Fee transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  console.log(`[fee] Fee transaction confirmed: ${signature}`);

  // Update earned rewards for all referrers in the chain
  for (const ref of referralChain) {
    try {
      const referrer = await User.findById(ref.userId);
      if (referrer) {
        referrer.earnedRewards = (referrer.earnedRewards || 0) + ref.lamports;
        await referrer.save();
        console.log(`[fee] Updated level ${ref.level} referrer ${ref.userId}: +${ref.lamports / web3.LAMPORTS_PER_SOL} SOL`);
      }
    } catch (err) {
      console.warn(`[fee] Failed to update rewards for referrer ${ref.userId}:`, err?.message || err);
    }
  }

  return signature;
});

const computeVolumeSol = (inputMint, outputMint, inputRaw, outputRaw) => {
  if (inputMint === SOL_MINT) return inputRaw / web3.LAMPORTS_PER_SOL;
  if (outputMint === SOL_MINT) return outputRaw / web3.LAMPORTS_PER_SOL;
  return 0;
};

const logSwap = async ({ userId, wallet, action, mode, inputMint, outputMint, amountSol, txid, status, error }) => {
  await TxLog.create({
    userId,
    wallet,
    action,
    mode,
    inputMint,
    outputMint,
    amountSol,
    txid,
    status,
    error: error ? String(error?.message || error) : null,
  });
};

const performSwap = ensureInit(async (user, walletKeypair, inputMint, outputMint, uiAmount, slippage = 0.5, context = {}) => {
  const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
  const connection = getConnection(user.rpc);

  const inputKey = new web3.PublicKey(inputMint);
  const outputKey = new web3.PublicKey(outputMint);
  const amountUi = Number(uiAmount);
  if (!Number.isFinite(amountUi) || amountUi <= 0) throw new Error('Amount must be positive');

  const { action = 'swap', mode = user.mode || 'manual' } = context || {};

  const amountRaw = await toBaseUnits(connection, inputKey.toBase58(), amountUi);
  if (amountRaw <= 0) throw new Error('Amount too small for mint decimals');

  const baseLog = {
    userId: user._id,
    wallet: walletKeypair.publicKey.toBase58(),
    action,
    mode,
    inputMint: inputKey.toBase58(),
    outputMint: outputKey.toBase58(),
  };

  if (dryRun) {
    const volumeSol = computeVolumeSol(baseLog.inputMint, baseLog.outputMint, amountRaw, amountRaw);
    const txid = `dryrun_${Date.now()}`;
    await logSwap({ ...baseLog, amountSol: volumeSol, txid, status: 'dryrun' });
    if (volumeSol > 0) {
      user.volume = (user.volume || 0) + volumeSol;
      await updateTier(user);
    }
    return {
      txid,
      feeTxid: null,
      input: { raw: amountRaw, uiAmount: amountUi },
      output: { raw: 0, uiAmount: 0 },
      volumeSol,
      dryRun: true,
    };
  }

  const jupiter = await getJupiter();
  const quote = await callJupiter(
    () => jupiter.quoteGet({
      inputMint: inputKey.toBase58(),
      outputMint: outputKey.toBase58(),
      amount: amountRaw.toString(),
      slippageBps: Math.max(1, Math.floor(Number(slippage) * 100)),
    }),
    'quote',
  );

  const swapRequest = {
    quoteResponse: quote,
    userPublicKey: walletKeypair.publicKey.toBase58(),
  };

  const usesSol = baseLog.inputMint === SOL_MINT || baseLog.outputMint === SOL_MINT;
  if (usesSol) swapRequest.wrapAndUnwrapSol = true;

  const priorityCandidate = Number(
    user.priorityFeeLamports ?? user.priorityFee ?? DEFAULT_PRIORITY_FEE
  );
  if (Number.isFinite(priorityCandidate) && priorityCandidate > 0) {
    swapRequest.prioritizationFeeLamports = Math.floor(priorityCandidate);
  }

  const swapResult = await callJupiter(
    () => jupiter.swapPost({ swapRequest }),
    'swap',
  );

  const swapTxBuf = typeof swapResult.swapTransaction === 'string'
    ? Buffer.from(swapResult.swapTransaction, 'base64')
    : Buffer.from(swapResult.swapTransaction);
  const swapTx = web3.VersionedTransaction.deserialize(swapTxBuf);

  const additionalSigners = Array.isArray(swapResult.signers) ? swapResult.signers : [];
  swapTx.sign([walletKeypair, ...additionalSigners]);

  const signature = await withRetry(
    () => connection.sendRawTransaction(swapTx.serialize(), { skipPreflight: true }),
    3,
    500
  );

  const lastValidBlockHeight = Number(swapResult?.lastValidBlockHeight) || undefined;
  const recentBlockhash = swapTx.message.recentBlockhash;
  await connection.confirmTransaction(
    lastValidBlockHeight
      ? { signature, blockhash: recentBlockhash, lastValidBlockHeight }
      : signature,
    'confirmed',
  );

  const inputRaw = Number(quote?.inAmount ?? amountRaw);
  const outputRaw = Number(quote?.outAmount ?? 0);
  const inputUiActual = inputRaw > 0 ? await fromBaseUnits(connection, baseLog.inputMint, inputRaw) : amountUi;
  const outputUiActual = outputRaw > 0 ? await fromBaseUnits(connection, baseLog.outputMint, outputRaw) : 0;
  const volumeSol = computeVolumeSol(baseLog.inputMint, baseLog.outputMint, inputRaw, outputRaw);

  let feeTxid = null;
  if (volumeSol > 0) {
    try {
      feeTxid = await collectPlatformFee({ connection, signer: walletKeypair, user, amountSol: volumeSol });
    } catch (feeErr) {
      console.error('[fee] Failed to collect platform fee:', feeErr?.message || feeErr);
    }
  }

  await logSwap({ ...baseLog, amountSol: volumeSol, txid: signature, status: 'confirmed' });

  if (volumeSol > 0) {
    user.volume = (user.volume || 0) + volumeSol;
    await updateTier(user);
  }

  return {
    txid: signature,
    feeTxid,
    input: { raw: inputRaw, uiAmount: inputUiActual },
    output: { raw: outputRaw, uiAmount: outputUiActual },
    volumeSol,
    dryRun: false,
  };
});

const payOutRewards = ensureInit(async ({ lamports, destination, rpc }) => {
  const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
  const connection = getConnection(rpc);
  if (dryRun) return `dryrun_payout_${Date.now()}`;

  const tx = new web3.Transaction().add(web3.SystemProgram.transfer({
    fromPubkey: REWARDS_KEYPAIR.publicKey,
    toPubkey: new web3.PublicKey(destination),
    lamports: Math.floor(lamports),
  }));
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = REWARDS_KEYPAIR.publicKey;
  tx.sign(REWARDS_KEYPAIR);

  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
});

module.exports = {
  encrypt,
  decrypt,
  getKeypair,
  getBalance,
  performSwap,
  collectPlatformFee,
  payOutRewards,
};
