// backend/src/services/bot.js
const { performSwap, getKeypair } = require('./solana');
const User = require('../models/user');
const web3 = require('@solana/web3.js');

const runningBots = new Map();  // userId -> intervalId

const startBot = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return;
  if (user.running) return;

  user.running = true;
  await user.save();

  const loop = async () => {
    // Build the set of keypairs the bot is allowed to use:
    // 1) Only sub-wallets are ever eligible
    // 2) If user.activeWallets is set, filter to those; otherwise use all subs
    const activeSet = new Set((user.activeWallets || []).map(String));

    let subKeypairs = [];
    for (const enc of (user.subWalletsEncrypted || [])) {
      try {
        const kp = getKeypair(enc);
        if (activeSet.size === 0 || activeSet.has(kp.publicKey.toString())) {
          subKeypairs.push(kp);
        }
      } catch (_) { /* ignore broken keys */ }
    }

    // No eligible wallets? Do nothing this cycle.
    if (!subKeypairs.length) return;

    const token = user.tokenMint;
    const solMint = web3.SystemProgram.programId.toString();
    const minBuy = user.minBuy, maxBuy = user.maxBuy;
    const minD = user.minDelay, maxD = user.maxDelay;

    const randomAmount = () => Math.random() * (maxBuy - minBuy) + minBuy;
    const randomDelay = () => Math.random() * (maxD - minD) + minD;
    const randomWallet = () => subKeypairs[Math.floor(Math.random() * subKeypairs.length)];

    switch (user.mode) {
      case 'pure':
        for (let wallet of subKeypairs) {
          const amt = randomAmount();
          await performSwap(user, wallet, solMint, token, amt);  // Buy
          await performSwap(user, wallet, token, solMint, amt);  // Sell full
          await new Promise(r => setTimeout(r, randomDelay()));
        }
        break;
      case 'growth':
        for (let wallet of subKeypairs) {
          const amt = randomAmount();
          await performSwap(user, wallet, solMint, token, amt);        // Buy
          await performSwap(user, wallet, token, solMint, amt * 0.9);  // Sell 90%
          await new Promise(r => setTimeout(r, randomDelay()));
        }
        break;
      case 'moonshot':
        for (let wallet of subKeypairs) {
          const amt = randomAmount();
          await performSwap(user, wallet, solMint, token, amt);  // Buy only
          await new Promise(r => setTimeout(r, randomDelay()));
        }
        break;
      case 'human':
        if (subKeypairs.length < 5) return;  // need enough wallets for the pattern
        const groupSize = Math.floor(Math.random() * 5) + 1;
        const group = [];
        for (let i = 0; i < groupSize; i++) group.push(randomWallet());
        for (let w of group) {
          await performSwap(user, w, solMint, token, randomAmount());  // Buy quick
          await new Promise(r => setTimeout(r, Math.random() * 5000));
        }
        await new Promise(r => setTimeout(r, 15000 + Math.random() * 15000));  // Slow sell
        for (let w of group) {
          await performSwap(user, w, token, solMint, randomAmount());  // Sell
        }
        break;
      case 'bump':
        // Continuous buy/sell across all
        for (const w of subKeypairs) {
          const amt = randomAmount();
          await performSwap(user, w, solMint, token, amt);
          await performSwap(user, w, token, solMint, amt);
          await new Promise(r => setTimeout(r, randomDelay()));
        }
        break;
      default:
        // default to 'pure' if unset/malformed
        for (let wallet of subKeypairs) {
          const amt = randomAmount();
          await performSwap(user, wallet, solMint, token, amt);
          await performSwap(user, wallet, token, solMint, amt);
          await new Promise(r => setTimeout(r, randomDelay()));
        }
    }
  };

  const interval = setInterval(loop, 60000);  // Run cycle every minute; adjust as needed
  runningBots.set(userId, interval);
};

const stopBot = async (userId) => {
  const interval = runningBots.get(userId);
  if (interval) clearInterval(interval);
  runningBots.delete(userId);
  const user = await User.findById(userId);
  if (user) {
    user.running = false;
    await user.save();
  }
};

module.exports = { startBot, stopBot };
