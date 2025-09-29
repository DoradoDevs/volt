// backend/src/services/bot.js
const { performSwap, getKeypair } = require('./solana');
const User = require('../models/user');
const TxLog = require('../models/txlog');
const web3 = require('@solana/web3.js');

const runningBots = new Map(); // userId -> { stop: boolean }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function botLoop(userId) {
  while (true) {
    const ctl = runningBots.get(userId);
    if (!ctl || ctl.stop) return;

    let user;
    try {
      user = await User.findById(userId);
      if (!user || !user.running) return;
    } catch {
      await sleep(1500);
      continue;
    }

    // Build active sub-wallet keypairs (deposit/source is NEVER used)
    const activeSet = new Set(user.activeWallets || []);
    const subKeypairs = (user.subWalletsEncrypted || [])
      .map((enc) => {
        try {
          const kp = getKeypair(enc);
          return activeSet.has(kp.publicKey.toString()) ? kp : null;
        } catch { return null; }
      })
      .filter(Boolean);

    if (!subKeypairs.length) {
      await sleep(2500);
      continue;
    }

    const token = user.tokenMint;
    const solMint = web3.SystemProgram.programId.toString();
    const minBuy = Math.max(0, Number(user.minBuy) || 0);
    const maxBuy = Math.max(minBuy, Number(user.maxBuy) || 0);
    const minD = Math.max(0, Number(user.minDelay) || 0);
    const maxD = Math.max(minD + 1, Number(user.maxDelay) || 0);

    const rnd = (a, b) => Math.random() * (b - a) + a;
    const randomAmount = () => rnd(minBuy, maxBuy);
    const randomDelay = () => rnd(minD, maxD);
    const randomWallet = () => subKeypairs[Math.floor(Math.random() * subKeypairs.length)];

    const trySwap = async ({ wallet, inputMint, outputMint, amount, mode }) => {
      let lastErr;
      for (let i = 0; i < 3; i++) {
        try {
          const txid = await performSwap(user, wallet, inputMint, outputMint, amount, 0.5);
          await TxLog.create({
            userId,
            wallet: wallet.publicKey.toString(),
            action: 'swap',
            inputMint,
            outputMint,
            amount,
            mode,
            txid,
            status: 'confirmed',
          });
          return;
        } catch (e) {
          lastErr = e;
          await TxLog.create({
            userId,
            wallet: wallet.publicKey.toString(),
            action: 'swap',
            inputMint,
            outputMint,
            amount,
            mode,
            status: 'error',
            error: String(e?.message || e),
          });
          await sleep(400 * Math.pow(2, i)); // 0.4s, 0.8s, 1.6s
        }
      }
      console.error(`[bot ${userId}] swap failed:`, lastErr?.message || lastErr);
    };

    try {
      switch ((user.mode || 'pure')) {
        case 'pure':
          for (const wallet of subKeypairs) {
            const amt = randomAmount();
            await trySwap({ wallet, inputMint: solMint, outputMint: token, amount: amt, mode: 'pure' });
            await trySwap({ wallet, inputMint: token,  outputMint: solMint, amount: amt, mode: 'pure' });
            await sleep(randomDelay());
          }
          break;

        case 'growth':
          for (const wallet of subKeypairs) {
            const amt = randomAmount();
            await trySwap({ wallet, inputMint: solMint, outputMint: token, amount: amt,        mode: 'growth' });
            await trySwap({ wallet, inputMint: token,  outputMint: solMint, amount: amt * 0.9, mode: 'growth' });
            await sleep(randomDelay());
          }
          break;

        case 'moonshot':
          for (const wallet of subKeypairs) {
            const amt = randomAmount();
            await trySwap({ wallet, inputMint: solMint, outputMint: token, amount: amt, mode: 'moonshot' });
            await sleep(randomDelay());
          }
          break;

        case 'human': {
          if (subKeypairs.length < 2) break;
          const groupSize = Math.max(1, Math.floor(Math.random() * Math.min(5, subKeypairs.length)) + 1);
          const group = Array.from({ length: groupSize }, () => randomWallet());
          for (const w of group) {
            await trySwap({ wallet: w, inputMint: solMint, outputMint: token, amount: randomAmount(), mode: 'human' });
            await sleep(Math.random() * 5000);
          }
          await sleep(15000 + Math.random() * 15000);
          for (const w of group) {
            await trySwap({ wallet: w, inputMint: token, outputMint: solMint, amount: randomAmount(), mode: 'human' });
          }
          break;
        }

        case 'bump':
          for (const w of subKeypairs) {
            const amt = randomAmount();
            await trySwap({ wallet: w, inputMint: solMint, outputMint: token, amount: amt, mode: 'bump' });
            await trySwap({ wallet: w, inputMint: token,  outputMint: solMint, amount: amt, mode: 'bump' });
            await sleep(randomDelay());
          }
          break;

        default:
          // unknown mode — idle briefly
          await sleep(1500);
      }
    } catch (e) {
      console.error(`[bot ${userId}] loop error:`, e?.message || e);
    }

    // Short cooldown between cycles; exit quickly if stopped
    for (let i = 0; i < 20; i++) {
      const ctl2 = runningBots.get(userId);
      if (!ctl2 || ctl2.stop) return;
      await sleep(1000);
    }
  }
}

const startBot = async (userId) => {
  const user = await User.findById(userId);
  if (!user || user.running) return;
  user.running = true;
  await user.save();

  if (runningBots.has(userId)) return;
  runningBots.set(userId, { stop: false });

  botLoop(userId).finally(() => {
    runningBots.delete(userId);
    User.findByIdAndUpdate(userId, { running: false }).catch(() => {});
  });
};

const stopBot = async (userId) => {
  const ctl = runningBots.get(userId);
  if (ctl) ctl.stop = true;
  await User.findByIdAndUpdate(userId, { running: false });
};

module.exports = { startBot, stopBot, runningBots };
