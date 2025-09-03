const User = require('../models/user');
const { encrypt, getKeypair, getBalance, performSwap, sellAllTokens, closeTokenAccounts } = require('../services/solana');
const { startBot, stopBot } = require('../services/bot');
const web3 = require('@solana/web3.js');

const getDashboard = async (req, res) => {
  const user = await User.findById(req.userId);
  const sourceKp = getKeypair(user.sourceEncrypted);
  const sourceBalance = await getBalance(sourceKp.publicKey.toString(), user.rpc);
  // Get sub balances similarly
  res.json({ tier: user.tier, referralCode: user.referralCode, earnedRewards: user.earnedRewards / web3.LAMPORTS_PER_SOL, sourceAddress: sourceKp.publicKey.toString(), sourceBalance, subWallets: user.subWalletsEncrypted.length, running: user.running /* etc */ });
};

const manageReferral = async (req, res) => {
  const { destination } = req.body;
  const user = await User.findById(req.userId);
  if (user.earnedRewards === 0) return res.status(400).json({ error: 'No rewards' });

  const connection = new web3.Connection(user.rpc || process.env.SOLANA_RPC);
  const txn = new web3.Transaction().add(
    web3.SystemProgram.transfer({
      fromPubkey: REWARDS_WALLET,
      toPubkey: new web3.PublicKey(destination),
      lamports: user.earnedRewards,
    })
  );
  const signed = await web3.signTransaction(txn, [REWARDS_KEYPAIR]);
  const txid = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(txid);

  user.earnedRewards = 0;
  await user.save();
  res.json({ txid });
};

const getTier = async (req, res) => {
  const user = await User.findById(req.userId);
  res.json({ tier: user.tier });
};

const manageWallets = async (req, res) => {
  const { action, count, confirm1, confirm2 } = req.body;  // add, remove
  const user = await User.findById(req.userId);
  if (action === 'add' && user.subWalletsEncrypted.length + count <= 100) {
    for (let i = 0; i < count; i++) {
      const kp = web3.Keypair.generate();
      user.subWalletsEncrypted.push(encrypt(bs58.encode(kp.secretKey)));
    }
  } else if (action === 'remove' && confirm1 === 'confirm' && confirm2 === 'confirm') {
    user.subWalletsEncrypted.splice(0, count);  // Or specific
  }
  await user.save();
  res.json({ message: 'Wallets updated' });
};

const depositWithdraw = async (req, res) => {
  const { action, amount, destination } = req.body;
  const user = await User.findById(req.userId);
  const sourceKp = getKeypair(user.sourceEncrypted);
  if (action === 'withdraw') {
    if (amount === 'MAX') amount = await getBalance(sourceKp.publicKey.toString(), user.rpc);
    const connection = new web3.Connection(user.rpc);
    const fee = getTierFee(user.tier) * amount * web3.LAMPORTS_PER_SOL;
    const txn = new web3.Transaction();
    if (user.referrer) {
      // Add referral transfers as in addFeeInstructions
    } else {
      txn.add(web3.SystemProgram.transfer({ fromPubkey: sourceKp.publicKey, toPubkey: FEE_WALLET, lamports: fee }));
    }
    txn.add(web3.SystemProgram.transfer({ fromPubkey: sourceKp.publicKey, toPubkey: new web3.PublicKey(destination), lamports: (amount * web3.LAMPORTS_PER_SOL) - fee }));
    const signed = await txn.sign(sourceKp);
    const txid = await connection.sendTransaction(signed);
    res.json({ txid });
  } else {
    res.json({ sourceAddress: sourceKp.publicKey.toString() });
  }
};

const distribute = async (req, res) => {
  const { amountPerWallet } = req.body;
  const user = await User.findById(req.userId);
  const sourceKp = getKeypair(user.sourceEncrypted);
  const subKps = user.subWalletsEncrypted.map(getKeypair);
  const total = amountPerWallet * subKps.length;
  const fee = getTierFee(user.tier) * total * web3.LAMPORTS_PER_SOL;
  const connection = new web3.Connection(user.rpc);

  const txn = new web3.Transaction();
  subKps.forEach((sub) => {
    txn.add(web3.SystemProgram.transfer({ fromPubkey: sourceKp.publicKey, toPubkey: sub.publicKey, lamports: amountPerWallet * web3.LAMPORTS_PER_SOL }));
  });
  // Add fee instructions
  const withFee = await addFeeInstructions(txn.serialize(), sourceKp, total, user, connection);
  const txid = await connection.sendRawTransaction(withFee);
  res.json({ txid });
};

const consolidate = async (req, res) => {
  const user = await User.findById(req.userId);
  const sourceKp = getKeypair(user.sourceEncrypted);
  const subKps = user.subWalletsEncrypted.map(getKeypair);
  const connection = new web3.Connection(user.rpc);
  let total = 0;
  const txn = new web3.Transaction();
  for (let sub of subKps) {
    const bal = await connection.getBalance(sub.publicKey);
    if (bal > 0) {
      txn.add(web3.SystemProgram.transfer({ fromPubkey: sub.publicKey, toPubkey: sourceKp.publicKey, lamports: bal }));
      total += bal / web3.LAMPORTS_PER_SOL;
    }
  }
  const withFee = await addFeeInstructions(txn.serialize(), sourceKp, total, user, connection);  // Fee on total consolidated
  const txid = await connection.sendRawTransaction(withFee);
  res.json({ txid });
};

const sellAll = async (req, res) => {
  const user = await User.findById(req.userId);
  const subKps = user.subWalletsEncrypted.map(getKeypair);
  for (let kp of [getKeypair(user.sourceEncrypted), ...subKps]) {
    await sellAllTokens(user, kp);
  }
  res.json({ message: 'Sold all' });
};

const closeAccounts = async (req, res) => {
  const user = await User.findById(req.userId);
  const subKps = user.subWalletsEncrypted.map(getKeypair);
  for (let kp of subKps) {
    await closeTokenAccounts(user, kp);
  }
  res.json({ message: 'Closed accounts' });
};

const startBot = async (req, res) => {
  await startBot(req.userId);
  res.json({ message: 'Bot started' });
};

const stopBot = async (req, res) => {
  await stopBot(req.userId);
  res.json({ message: 'Bot stopped' });
};

const updateSettings = async (req, res) => {
  const user = await User.findById(req.userId);
  Object.assign(user, req.body);  // rpc, minBuy, etc.
  await user.save();
  res.json({ message: 'Updated' });
};

module.exports = { getDashboard, manageReferral, getTier, manageWallets, depositWithdraw, distribute, consolidate, sellAll, closeAccounts, startBot, stopBot, updateSettings };