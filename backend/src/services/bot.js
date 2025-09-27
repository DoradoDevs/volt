const web3 = require('@solana/web3.js');
const User = require('../models/user');
const { performSwap, getKeypair, WSOL_MINT } = require('./solana');

const runningBots = new Map(); // userId -> intervalId
const randIn = (min, max) => Math.random() * (max - min) + min;

const startBot = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.running) return;

  user.running = true;
  await user.save();

  const loop = async () => {
    try {
      const u = await User.findById(userId);
      if (!u || !u.running) return;

      const token = u.tokenMint;
      if (!token) return;

      // Build all candidate wallets
      const candidate = [];

      if (u.sourceEncrypted) {
        const kp = getKeypair(u.sourceEncrypted);
        candidate.push(kp);
      }
      (u.subWalletsEncrypted || []).forEach((enc) => {
        try { candidate.push(getKeypair(enc)); } catch (_) {}
      });

      if (!candidate.length) return;

      // Filter to active wallets if set
      let subKeypairs = candidate;
      if (u.activeWallets && u.activeWallets.length > 0) {
        const activeSet = new Set(u.activeWallets);
        subKeypairs = candidate.filter(kp => activeSet.has(kp.publicKey.toString()));
      }
      if (!subKeypairs.length) return;

      const randomAmount = () => randIn(u.minBuy || 0.001, u.maxBuy || 0.002);
      const randomDelay = () => randIn(u.minDelay || 500, u.maxDelay || 1500);
      const randomWallet = () => subKeypairs[Math.floor(Math.random() * subKeypairs.length)];

      switch ((u.mode || 'pure')) {
        case 'pure':
          for (const wallet of subKeypairs) {
            const amt = randomAmount();
            await performSwap(u, wallet, WSOL_MINT, token, amt);       // buy
            await performSwap(u, wallet, token, WSOL_MINT, amt);       // sell
            await new Promise(r => setTimeout(r, randomDelay()));
          }
          break;
        case 'growth':
          for (const wallet of subKeypairs) {
            const amt = randomAmount();
            await performSwap(u, wallet, WSOL_MINT, token, amt);
            await new Promise(r => setTimeout(r, 250));
            await performSwap(u, wallet, token, WSOL_MINT, amt * 0.9);
            await new Promise(r => setTimeout(r, randomDelay()));
          }
          break;
        case 'moonshot':
          for (const wallet of subKeypairs) {
            await performSwap(u, wallet, WSOL_MINT, token, randomAmount());
            await new Promise(r => setTimeout(r, randomDelay()));
          }
          break;
        case 'human':
          if (subKeypairs.length < 5) break;
          const groupSize = Math.floor(Math.random() * 5) + 1;
          const group = [];
          for (let i = 0; i < groupSize; i++) group.push(randomWallet());
          for (const w of group) {
            await performSwap(u, w, WSOL_MINT, token, randomAmount());
            await new Promise(r => setTimeout(r, Math.random() * 5000));
          }
          await new Promise(r => setTimeout(r, 15000 + Math.random() * 15000));
          for (const w of group) {
            await performSwap(u, w, token, WSOL_MINT, randomAmount());
          }
          break;
        case 'bump':
          for (const w of subKeypairs) {
            const amt = randomAmount();
            await performSwap(u, w, WSOL_MINT, token, amt);
            await performSwap(u, w, token, WSOL_MINT, amt);
            await new Promise(r => setTimeout(r, randomDelay()));
          }
          break;
        default:
          break;
      }
    } catch (e) {
      console.error(`[bot] ${userId} loop error:`, e.message);
    }
  };

  const interval = setInterval(loop, 60_000);
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
