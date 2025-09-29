// backend/src/services/solana.js
const web3 = require('@solana/web3.js');
const { Jupiter } = require('@jup-ag/api');
const CryptoJS = require('crypto-js');
const bs58 = require('bs58');
const User = require('../models/user');
const TxLog = require('../models/txlog');

// Lazy env objects
let FEE_WALLET, REWARDS_WALLET, REWARDS_KEYPAIR, ENCRYPTION_SECRET;
let DEFAULT_RPC;

const initializeEnvironment = () => {
  if (!process.env.FEE_WALLET) throw new Error('FEE_WALLET not set');
  if (!process.env.REWARDS_WALLET_ADDRESS) throw new Error('REWARDS_WALLET_ADDRESS not set');
  if (!process.env.REWARDS_PRIVATE_KEY) throw new Error('REWARDS_PRIVATE_KEY not set');
  if (!process.env.ENCRYPTION_SECRET) throw new Error('ENCRYPTION_SECRET not set');

  FEE_WALLET = new web3.PublicKey(process.env.FEE_WALLET);
  REWARDS_WALLET = new web3.PublicKey(process.env.REWARDS_WALLET_ADDRESS);
  REWARDS_KEYPAIR = web3.Keypair.fromSecretKey(bs58.decode(process.env.REWARDS_PRIVATE_KEY));
  ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
  DEFAULT_RPC = process.env.SOLANA_RPC;
};

const ensureInit = (fn) => (...args) => {
  if (!FEE_WALLET) initializeEnvironment();
  return fn(...args);
};

// === Crypto helpers
const encrypt = ensureInit((text) => CryptoJS.AES.encrypt(text, ENCRYPTION_SECRET).toString());
const decrypt = ensureInit((ciphertext) => CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_SECRET).toString(CryptoJS.enc.Utf8));
const getKeypair = ensureInit((encrypted) => {
  const pk = bs58.decode(decrypt(encrypted));
  return web3.Keypair.fromSecretKey(pk);
});

// === Chain helpers
const getConnection = ensureInit((rpc) => new web3.Connection(rpc || DEFAULT_RPC, 'confirmed'));

// Fee rate (0.1%)
const FEE_RATE = 0.001; // 0.1%

// Tier discounts (off the base fee) – adjust as you prefer
const getTierDiscount = (tier) => {
  const d = { unranked: 0, bronze: 0.001, silver: 0.002, gold: 0.003, diamond: 0.005 }; // e.g., 0.1%-0.5% off
  return d[tier] || 0;
};

// Referral share (portion of fee that goes to referrer wallet)
const getReferralShare = (tier) => {
  const shares = { unranked: 0.10, bronze: 0.125, silver: 0.15, gold: 0.20, diamond: 0.25 };
  return shares[tier] || 0.10;
};

// Assemble fee transfers & sign/serialize
const addFeeInstructions = ensureInit(async (serialized, signer, amountSol, user, connection) => {
  const baseFeeLamports = Math.floor(amountSol * FEE_RATE * web3.LAMPORTS_PER_SOL);
  const discount = getTierDiscount(user.tier);
  const effectiveLamports = Math.max(0, Math.floor(baseFeeLamports * (1 - discount)));

  // Compute split if referrer
  let feeToApp = effectiveLamports;
  let feeToRef = 0;

  if (user.referrer) {
    const refUser = await User.findById(user.referrer);
    if (refUser) {
      const share = getReferralShare(refUser.tier);
      feeToRef = Math.floor(effectiveLamports * share);
      feeToApp = effectiveLamports - feeToRef;

      // accumulate in earnedRewards for refUser
      refUser.earnedRewards = (refUser.earnedRewards || 0) + feeToRef;
      await refUser.save();
    }
  }

  const ix = [
    web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 })
  ];

  if (feeToRef > 0) {
    ix.push(web3.SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: REWARDS_WALLET,
      lamports: feeToRef
    }));
  }
  if (feeToApp > 0) {
    ix.push(web3.SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: FEE_WALLET,
      lamports: feeToApp
    }));
  }

  const vTxn = web3.VersionedTransaction.deserialize(serialized);
  vTxn.message.setInstructions([...ix, ...vTxn.message.instructions]);
  vTxn.sign([signer]);
  return vTxn.serialize();
});

// Retry helper with backoff
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, tries = 3, base = 250) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await sleep(base * Math.pow(2, i));
    }
  }
  throw lastErr;
}

// Update tier thresholds
const updateTier = async (user) => {
  const v = user.volume || 0;
  if (v > 1000) user.tier = 'diamond';
  else if (v > 500) user.tier = 'gold';
  else if (v > 250) user.tier = 'silver';
  else if (v > 100) user.tier = 'bronze';
  await user.save();
};

const getBalance = ensureInit(async (address, rpc) => {
  const connection = getConnection(rpc);
  return (await connection.getBalance(new web3.PublicKey(address))) / web3.LAMPORTS_PER_SOL;
});

// === Swap via Jupiter (with DRY_RUN)
const performSwap = ensureInit(async (user, walletKeypair, inputMint, outputMint, amountSol, slippage = 0.5) => {
  const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
  const connection = getConnection(user.rpc);

  if (dryRun) {
    // Simulate: log & bump volume/tier
    await TxLog.create({
      userId: user._id,
      wallet: walletKeypair.publicKey.toString(),
      mode: user.mode,
      action: 'swap',
      inputMint,
      outputMint,
      amountSol,
      txid: `dryrun_${Date.now()}`,
      status: 'dryrun',
    });
    user.volume = (user.volume || 0) + amountSol;
    await updateTier(user);
    return `dryrun_${Date.now()}`;
  }

  const jupiter = await withRetry(() => Jupiter.load({ connection }), 3, 300);
  const quote = await withRetry(
    () => jupiter.quote({
      inputMint: new web3.PublicKey(inputMint),
      outputMint: new web3.PublicKey(outputMint),
      amount: Math.floor(amountSol * web3.LAMPORTS_PER_SOL),
      slippageBps: Math.floor(slippage * 100),
    }),
    3,
    300
  );

  const swapResult = await withRetry(
    () => jupiter.swap({ swapRequest: { quoteResponse: quote, userPublicKey: walletKeypair.publicKey } }),
    3,
    300
  );

  const swapTransaction = swapResult.swapTransaction;
  const txnWithFee = await addFeeInstructions(swapTransaction, walletKeypair, amountSol, user, connection);
  const txid = await withRetry(() => connection.sendRawTransaction(txnWithFee, { skipPreflight: true }), 3, 500);
  await connection.confirmTransaction(txid, 'confirmed');

  await TxLog.create({
    userId: user._id,
    wallet: walletKeypair.publicKey.toString(),
    mode: user.mode,
    action: 'swap',
    inputMint,
    outputMint,
    amountSol,
    txid,
    status: 'confirmed',
  });

  user.volume = (user.volume || 0) + amountSol;
  await updateTier(user);
  return txid;
});

const sellAllTokens = ensureInit(async (_user, _walletKeypair) => {
  // TODO: implement token->SOL sweep if you want (left as placeholder)
});

const closeTokenAccounts = ensureInit(async (_user, _walletKeypair) => {
  // TODO: implement ATA close of 0-balance accounts (left as placeholder)
});

// Payout referral rewards: transfer lamports from REWARDS_KEYPAIR to destination
const payOutRewards = ensureInit(async ({ lamports, destination, rpc }) => {
  const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
  const connection = getConnection(rpc);
  if (dryRun) return `dryrun_payout_${Date.now()}`;

  const tx = new web3.Transaction().add(
    web3.SystemProgram.transfer({
      fromPubkey: REWARDS_KEYPAIR.publicKey,
      toPubkey: new web3.PublicKey(destination),
      lamports: Math.floor(lamports),
    })
  );
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = REWARDS_KEYPAIR.publicKey;
  tx.sign(REWARDS_KEYPAIR);

  const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await connection.confirmTransaction(txid, 'confirmed');
  return txid;
});

module.exports = {
  encrypt,
  decrypt,
  getKeypair,
  getBalance,
  performSwap,
  addFeeInstructions,
  payOutRewards,
  sellAllTokens,
  closeTokenAccounts,
};
