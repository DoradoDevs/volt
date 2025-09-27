// backend/services/solana.js
const web3 = require('@solana/web3.js');
const { Jupiter } = require('@jup-ag/api');
const CryptoJS = require('crypto-js');
const bs58 = require('bs58');
const User = require('../models/user');

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Lazy env
let FEE_WALLET, REWARDS_WALLET, REWARDS_KEYPAIR, ENCRYPTION_SECRET;

const initializeEnvironment = () => {
  if (!process.env.FEE_WALLET) throw new Error('FEE_WALLET not set in .env');
  if (!process.env.REWARDS_WALLET_ADDRESS) throw new Error('REWARDS_WALLET_ADDRESS not set in .env');
  if (!process.env.REWARDS_PRIVATE_KEY) throw new Error('REWARDS_PRIVATE_KEY not set in .env');
  ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
  if (!ENCRYPTION_SECRET) throw new Error('ENCRYPTION_SECRET not set in .env');

  FEE_WALLET = new web3.PublicKey(process.env.FEE_WALLET);
  REWARDS_WALLET = new web3.PublicKey(process.env.REWARDS_WALLET_ADDRESS);
  REWARDS_KEYPAIR = web3.Keypair.fromSecretKey(bs58.decode(process.env.REWARDS_PRIVATE_KEY));
};

const ensureInitialized = (fn) => (...args) => {
  if (!FEE_WALLET) initializeEnvironment();
  return fn(...args);
};

// Encryption helpers
const encrypt = ensureInitialized((text) => CryptoJS.AES.encrypt(text, ENCRYPTION_SECRET).toString());
const decrypt = ensureInitialized((ciphertext) => CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_SECRET).toString(CryptoJS.enc.Utf8));
const getKeypair = ensureInitialized((encrypted) => {
  const pk = bs58.decode(decrypt(encrypted));
  return web3.Keypair.fromSecretKey(pk);
});

// Connections
const getConnection = ensureInitialized((rpc) => new web3.Connection(rpc || process.env.SOLANA_RPC));

// Fees/tiers
const getTierFee = ensureInitialized((tier) => {
  const fees = { unranked: 0.01, bronze: 0.009, silver: 0.008, gold: 0.007, diamond: 0.005 };
  return fees[tier] ?? 0.01;
});
const getReferralShare = ensureInitialized((tier) => {
  const shares = { unranked: 0.1, bronze: 0.125, silver: 0.15, gold: 0.2, diamond: 0.25 };
  return shares[tier] ?? 0.1;
});

// Add our fee + (optional) referral
const addFeeInstructions = ensureInitialized(async (serializedVtx, signer, nominalSolAmount, user, connection) => {
  const tierRate = getTierFee(user.tier);
  const totalLamports = Math.floor(nominalSolAmount * tierRate * web3.LAMPORTS_PER_SOL);

  const extra = [web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 })];

  if (user.referrer) {
    const referrer = await User.findById(user.referrer);
    const refShare = Math.floor(totalLamports * getReferralShare(referrer?.tier || 'unranked'));
    if (refShare > 0) {
      extra.push(web3.SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: REWARDS_WALLET, // keep rewards pool, then payout claims
        lamports: refShare,
      }));
      referrer.earnedRewards += refShare;
      await referrer.save();
    }
    const appShare = totalLamports - refShare;
    if (appShare > 0) {
      extra.push(web3.SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: FEE_WALLET,
        lamports: appShare,
      }));
    }
  } else {
    if (totalLamports > 0) {
      extra.push(web3.SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: FEE_WALLET,
        lamports: totalLamports,
      }));
    }
  }

  const vTxn = web3.VersionedTransaction.deserialize(serializedVtx);
  vTxn.message.setInstructions([...extra, ...vTxn.message.instructions]);
  vTxn.sign([signer]);
  return vTxn.serialize();
});

// Swap (Jupiter)
const performSwap = ensureInitialized(async (user, walletKeypair, inputMint, outputMint, amountSol, slippage = 0.5) => {
  const connection = getConnection(user.rpc);
  const jupiter = await Jupiter.load({ connection });

  const quote = await jupiter.quote({
    inputMint: new web3.PublicKey(inputMint),
    outputMint: new web3.PublicKey(outputMint),
    amount: Math.floor(amountSol * web3.LAMPORTS_PER_SOL),
    slippageBps: Math.floor(slippage * 100),
  });

  const { swapTransaction } = await jupiter.swap({
    swapRequest: { quoteResponse: quote, userPublicKey: walletKeypair.publicKey },
  });

  const txnWithFee = await addFeeInstructions(swapTransaction, walletKeypair, amountSol, user, connection);
  const txid = await connection.sendRawTransaction(txnWithFee, { skipPreflight: true });
  await connection.confirmTransaction(txid, 'confirmed');

  user.volume += amountSol;
  await updateTier(user);
  return txid;
});

const updateTier = ensureInitialized(async (user) => {
  const v = user.volume;
  if (v > 1000) user.tier = 'diamond';
  else if (v > 500) user.tier = 'gold';
  else if (v > 250) user.tier = 'silver';
  else if (v > 100) user.tier = 'bronze';
  await user.save();
});

const getBalance = ensureInitialized(async (address, rpc) => {
  const connection = getConnection(rpc);
  return (await connection.getBalance(new web3.PublicKey(address))) / web3.LAMPORTS_PER_SOL;
});

// Rewards payout from rewards key
const payOutRewards = ensureInitialized(async ({ lamports, destination, rpc }) => {
  const connection = getConnection(rpc);
  const tx = new web3.Transaction().add(
    web3.SystemProgram.transfer({
      fromPubkey: REWARDS_KEYPAIR.publicKey,
      toPubkey: new web3.PublicKey(destination),
      lamports,
    })
  );
  const sig = await connection.sendTransaction(tx, [REWARDS_KEYPAIR], { skipPreflight: true });
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
});

// TODOs for token sweeping if you want later
const sellAllTokens = ensureInitialized(async (_user, _walletKeypair) => {});
const closeTokenAccounts = ensureInitialized(async (_user, _walletKeypair) => {});

module.exports = {
  WSOL_MINT,
  encrypt,
  decrypt,
  getKeypair,
  getBalance,
  performSwap,
  getTierFee,
  addFeeInstructions,
  payOutRewards
};
