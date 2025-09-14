const web3 = require('@solana/web3.js');
const { Jupiter } = require('@jup-ag/api');
const CryptoJS = require('crypto-js');
const bs58 = require('bs58');
const User = require('../models/user'); // Ensure User model is imported

// Validate environment variables
if (!process.env.FEE_WALLET) {
  throw new Error('FEE_WALLET not set in .env');
}
if (!process.env.REWARDS_WALLET_ADDRESS) {
  throw new Error('REWARDS_WALLET_ADDRESS not set in .env');
}
if (!process.env.REWARDS_PRIVATE_KEY) {
  throw new Error('REWARDS_PRIVATE_KEY not set in .env');
}

console.log('FEE_WALLET:', process.env.FEE_WALLET);
console.log('REWARDS_WALLET_ADDRESS:', process.env.REWARDS_WALLET_ADDRESS);

let FEE_WALLET, REWARDS_WALLET, REWARDS_KEYPAIR;
try {
  FEE_WALLET = new web3.PublicKey(process.env.FEE_WALLET);
} catch (e) {
  throw new Error(`Invalid FEE_WALLET address: ${process.env.FEE_WALLET} - ${e.message}`);
}
try {
  REWARDS_WALLET = new web3.PublicKey(process.env.REWARDS_WALLET_ADDRESS);
} catch (e) {
  throw new Error(`Invalid REWARDS_WALLET_ADDRESS: ${process.env.REWARDS_WALLET_ADDRESS} - ${e.message}`);
}
try {
  REWARDS_KEYPAIR = web3.Keypair.fromSecretKey(bs58.decode(process.env.REWARDS_PRIVATE_KEY));
} catch (e) {
  throw new Error(`Invalid REWARDS_PRIVATE_KEY: ${e.message}`);
}

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;

const encrypt = (text) => CryptoJS.AES.encrypt(text, ENCRYPTION_SECRET).toString();
const decrypt = (ciphertext) => CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_SECRET).toString(CryptoJS.enc.Utf8);

const getKeypair = (encrypted) => {
  const pk = bs58.decode(decrypt(encrypted));
  return web3.Keypair.fromSecretKey(pk);
};

const getConnection = (rpc) => new web3.Connection(rpc || process.env.SOLANA_RPC);

const getTierFee = (tier) => {
  const fees = { unranked: 0.01, bronze: 0.009, silver: 0.008, gold: 0.007, diamond: 0.005 };
  return fees[tier] || 0.01; // Default to unranked if tier is invalid
};

const getReferralShare = (tier) => {
  const shares = { unranked: 0.1, bronze: 0.125, silver: 0.15, gold: 0.2, diamond: 0.25 };
  return shares[tier] || 0.1; // Default to unranked
};

const addFeeInstructions = async (txn, signer, feeAmount, user, connection) => {
  const feeLamports = feeAmount * web3.LAMPORTS_PER_SOL;
  const tierFee = getTierFee(user.tier);
  const actualFee = tierFee * feeAmount * web3.LAMPORTS_PER_SOL;

  let instructions = [web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 })];

  if (user.referrer) {
    const referrer = await User.findById(user.referrer);
    const share = getReferralShare(referrer.tier) * actualFee;
    instructions.push(
      web3.SystemProgram.transfer({ fromPubkey: signer.publicKey, toPubkey: REWARDS_WALLET, lamports: Math.floor(share) })
    );
    referrer.earnedRewards += Math.floor(share);
    await referrer.save();
    const appShare = actualFee - share;
    instructions.push(
      web3.SystemProgram.transfer({ fromPubkey: signer.publicKey, toPubkey: FEE_WALLET, lamports: Math.floor(appShare) })
    );
  } else {
    instructions.push(
      web3.SystemProgram.transfer({ fromPubkey: signer.publicKey, toPubkey: FEE_WALLET, lamports: Math.floor(actualFee) })
    );
  }

  const vTxn = web3.VersionedTransaction.deserialize(txn);
  vTxn.message.setInstructions([...instructions, ...vTxn.message.instructions]);
  vTxn.sign([signer]);
  return vTxn.serialize();
};

const performSwap = async (user, walletKeypair, inputMint, outputMint, amountSol, slippage = 0.5) => {
  const connection = getConnection(user.rpc);
  let jupiter;
  try {
    jupiter = await Jupiter.load({ connection });
  } catch (e) {
    throw new Error(`Failed to initialize Jupiter API: ${e.message}`);
  }
  let quote;
  try {
    quote = await jupiter.quote({
      inputMint: new web3.PublicKey(inputMint),
      outputMint: new web3.PublicKey(outputMint),
      amount: amountSol * web3.LAMPORTS_PER_SOL,
      slippageBps: slippage * 100,
    });
  } catch (e) {
    throw new Error(`Failed to get Jupiter quote: ${e.message}`);
  }
  let swapTransaction;
  try {
    const swapResult = await jupiter.swap({ swapRequest: { quoteResponse: quote, userPublicKey: walletKeypair.publicKey } });
    swapTransaction = swapResult.swapTransaction;
  } catch (e) {
    throw new Error(`Failed to create swap transaction: ${e.message}`);
  }
  const txnWithFee = await addFeeInstructions(swapTransaction, walletKeypair, amountSol, user, connection);
  const txid = await connection.sendRawTransaction(txnWithFee);
  await connection.confirmTransaction(txid);
  user.volume += amountSol;
  await updateTier(user);
  return txid;
};

const updateTier = async (user) => {
  const v = user.volume;
  if (v > 1000) user.tier = 'diamond';
  else if (v > 500) user.tier = 'gold';
  else if (v > 250) user.tier = 'silver';
  else if (v > 100) user.tier = 'bronze';
  await user.save();
};

const getBalance = async (address, rpc) => {
  const connection = getConnection(rpc);
  return await connection.getBalance(new web3.PublicKey(address)) / web3.LAMPORTS_PER_SOL;
};

const sellAllTokens = async (user, walletKeypair) => {
  // Get token balance, perform swap token -> SOL, add fee
  // Assume token ATA exists; use getTokenAccountsByOwner
};

const closeTokenAccounts = async (user, walletKeypair) => {
  // Find all ATAs with 0 balance, close with TokenProgram.closeAccount
};

module.exports = { encrypt, decrypt, getKeypair, performSwap, getBalance, sellAllTokens, closeTokenAccounts };