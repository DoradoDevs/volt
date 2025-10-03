const web3 = require('@solana/web3.js');
const { Jupiter } = require('@jup-ag/api');
const CryptoJS = require('crypto-js');
const bs58 = require('bs58');

const User = require('../models/user');
const TxLog = require('../models/txlog');

const SOL_MINT = web3.NATIVE_MINT.toBase58();

let FEE_WALLET;
let REWARDS_WALLET;
let REWARDS_KEYPAIR;
let ENCRYPTION_SECRET;
let DEFAULT_RPC;
let FEE_RATE;
let REBATE_ADDRESS;
let FORCE_REBATE;

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

const REFERRAL_SHARES = {
  unranked: 0.10,
  bronze: 0.125,
  silver: 0.15,
  gold: 0.20,
  diamond: 0.25,
};

const getTierDiscount = (tier) => TIER_DISCOUNTS[(tier || '').toLowerCase()] || 0;
const getReferralShare = (tier) => REFERRAL_SHARES[(tier || '').toLowerCase()] || REFERRAL_SHARES.unranked;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const jupiterCache = new Map();

const getJupiter = async (connection) => {
  const endpoint = connection.rpcEndpoint || DEFAULT_RPC;
  if (jupiterCache.has(endpoint)) return jupiterCache.get(endpoint);
  const instance = await Jupiter.load({ connection });
  jupiterCache.set(endpoint, instance);
  return instance;
};

const computeFeeParts = async (amountSol, user) => {
  if (!amountSol || amountSol <= 0) {
    return { lamports: 0, feeToApp: 0, feeToRef: 0, refUser: null };
  }

  const baseLamports = Math.floor(amountSol * FEE_RATE * web3.LAMPORTS_PER_SOL);
  if (baseLamports <= 0) {
    return { lamports: 0, feeToApp: 0, feeToRef: 0, refUser: null };
  }

  const discount = getTierDiscount(user.tier);
  const effectiveLamports = Math.max(0, Math.floor(baseLamports * (1 - discount)));

  let feeToApp = effectiveLamports;
  let feeToRef = 0;
  let refUser = null;

  if (user.referrer) {
    refUser = await User.findById(user.referrer);
    if (refUser) {
      const share = getReferralShare(refUser.tier);
      feeToRef = Math.min(effectiveLamports, Math.floor(effectiveLamports * share));
      feeToApp = effectiveLamports - feeToRef;
    }
  }

  return { lamports: effectiveLamports, feeToApp, feeToRef, refUser };
};

const collectPlatformFee = ensureInit(async ({ connection, signer, user, amountSol }) => {
  if (!amountSol || amountSol <= 0) return null;

  const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
  const { lamports, feeToApp, feeToRef, refUser } = await computeFeeParts(amountSol, user);
  if (lamports <= 0) return null;
  if (dryRun) return `dryrun_fee_${Date.now()}`;

  const instructions = [];
  if (feeToRef > 0) {
    instructions.push(web3.SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: REWARDS_WALLET,
      lamports: feeToRef,
    }));
  }
  if (feeToApp > 0) {
    instructions.push(web3.SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: FEE_WALLET,
      lamports: feeToApp,
    }));
  }
  if (!instructions.length) return null;

  const tx = new web3.Transaction().add(...instructions);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = signer.publicKey;
  tx.sign(signer);

  const signature = await withRetry(
    () => connection.sendRawTransaction(tx.serialize(), { skipPreflight: true }),
    3,
    500
  );
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

  if (refUser && feeToRef > 0) {
    refUser.earnedRewards = (refUser.earnedRewards || 0) + feeToRef;
    await refUser.save();
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

  const jupiter = await getJupiter(connection);
  const quote = await withRetry(
    () => jupiter.quote({
      inputMint: inputKey,
      outputMint: outputKey,
      amount: amountRaw,
      slippageBps: Math.max(1, Math.floor(Number(slippage) * 100)),
    }),
    3,
    300
  );

  const swapResult = await withRetry(
    () => jupiter.swap({
      swapRequest: {
        quoteResponse: quote,
        userPublicKey: walletKeypair.publicKey,
        prioritizationFeeLamports: 0,
      },
    }),
    3,
    300
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
  await connection.confirmTransaction(signature, 'confirmed');

  const inputRaw = Number(swapResult.swapResponse?.inputAmount ?? amountRaw);
  const outputRaw = Number(swapResult.swapResponse?.outputAmount ?? 0);
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
