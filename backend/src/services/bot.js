const { performSwap, getKeypair } = require('./solana');
const User = require('../models/user');

const runningBots = new Map();  // userId -> intervalId

const startBot = async (userId) => {
  const user = await User.findById(userId);
  if (user.running) return;
  user.running = true;
  await user.save();

  const loop = async () => {
    const subKeypairs = user.subWalletsEncrypted.map(getKeypair);
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
          await performSwap(user, wallet, solMint, token, amt);  // Buy
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
        if (subKeypairs.length < 5) return;  // Error
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
        subKeypairs.forEach(async (w) => {
          const amt = randomAmount();
          await performSwap(user, w, solMint, token, amt);
          await performSwap(user, w, token, solMint, amt);
          await new Promise(r => setTimeout(r, randomDelay()));
        });
        break;
    }
  };

  const interval = setInterval(loop, 60000);  // Run cycle every min, adjust
  runningBots.set(userId, interval);
};

const stopBot = async (userId) => {
  const interval = runningBots.get(userId);
  if (interval) clearInterval(interval);
  runningBots.delete(userId);
  const user = await User.findById(userId);
  user.running = false;
  await user.save();
};

module.exports = { startBot, stopBot };