const { performSwap, getKeypair } = require('./solana');
const User = require('../models/user');
const TxLog = require('../models/txlog');
const web3 = require('@solana/web3.js');

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const runningBots = new Map(); // userId (string) -> { stop: boolean }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const parseNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const getActiveKeypairs = (user) => {
  const encrypted = Array.isArray(user.subWalletsEncrypted) ? user.subWalletsEncrypted : [];
  const activeSet = new Set((user.activeWallets || []).map((a) => a.toString()));

  return encrypted
    .map((enc) => {
      try {
        const kp = getKeypair(enc);
        if (!activeSet.size) return kp;
        return activeSet.has(kp.publicKey.toBase58()) ? kp : null;
      } catch (err) {
        console.warn('[bot] failed to decode wallet', err?.message || err);
        return null;
      }
    })
    .filter(Boolean);
};

const logSwapError = async (userId, wallet, context, err, uiAmount) => {
  const { action, mode, inputMint, outputMint } = context;
  const amountSol = (inputMint === SOL_MINT || outputMint === SOL_MINT) ? Number(uiAmount) || 0 : 0;

  await TxLog.create({
    userId,
    wallet,
    action,
    mode,
    inputMint,
    outputMint,
    amountSol,
    status: 'failed',
    error: err ? String(err?.message || err) : 'unknown error',
  });
};

async function trySwap({ user, walletKeypair, inputMint, outputMint, uiAmount, mode, action }) {
  const context = { inputMint, outputMint, mode, action };
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await performSwap(user, walletKeypair, inputMint, outputMint, uiAmount, 0.5, context);
    } catch (err) {
      lastError = err;
      await logSwapError(user._id, walletKeypair.publicKey.toBase58(), context, err, uiAmount);
      await sleep(400 * Math.pow(2, attempt));
      const ctl = runningBots.get(user._id.toString());
      if (!ctl || ctl.stop) break;
    }
  }
  if (lastError) {
    console.error(`[bot ${user._id}] swap failed:`, lastError?.message || lastError);
  }
  return null;
}

async function botLoop(userId) {
  while (true) {
    const ctl = runningBots.get(userId);
    if (!ctl || ctl.stop) return;

    let user;
    try {
      user = await User.findById(userId);
    } catch (err) {
      console.warn(`[bot ${userId}] failed to load user:`, err?.message || err);
      await sleep(1500);
      continue;
    }

    if (!user || !user.running) return;

    const tokenMint = (user.tokenMint || '').trim();
    if (!BASE58_RE.test(tokenMint)) {
      await sleep(3000);
      continue;
    }

    const wallets = getActiveKeypairs(user);
    if (!wallets.length) {
      await sleep(2500);
      continue;
    }

    const minBuy = Math.max(0.00001, parseNumber(user.minBuy, 0.01));
    const maxBuy = Math.max(minBuy, parseNumber(user.maxBuy, minBuy));
    const minDelay = Math.max(250, parseNumber(user.minDelay, 1000));
    const maxDelay = Math.max(minDelay, parseNumber(user.maxDelay, minDelay + 1000));

    const randomAmount = () => Math.max(minBuy, Math.random() * (maxBuy - minBuy) + minBuy);
    const randomDelay = () => Math.random() * (maxDelay - minDelay) + minDelay;

    const mode = (user.mode || 'pure').toLowerCase();

    try {
      switch (mode) {
        case 'pure':
          for (const wallet of wallets) {
            if (runningBots.get(userId)?.stop) return;
            const buy = await trySwap({
              user,
              walletKeypair: wallet,
              inputMint: SOL_MINT,
              outputMint: tokenMint,
              uiAmount: randomAmount(),
              mode: 'pure',
              action: 'bot-buy',
            });
            if (buy && buy.output.uiAmount > 0) {
              await sleep(randomDelay());
              await trySwap({
                user,
                walletKeypair: wallet,
                inputMint: tokenMint,
                outputMint: SOL_MINT,
                uiAmount: buy.output.uiAmount,
                mode: 'pure',
                action: 'bot-sell',
              });
            }
            await sleep(randomDelay());
          }
          break;

        case 'growth':
          for (const wallet of wallets) {
            if (runningBots.get(userId)?.stop) return;
            const buy = await trySwap({
              user,
              walletKeypair: wallet,
              inputMint: SOL_MINT,
              outputMint: tokenMint,
              uiAmount: randomAmount(),
              mode: 'growth',
              action: 'bot-buy',
            });
            if (buy && buy.output.uiAmount > 0) {
              const sellAmount = buy.output.uiAmount * 0.9;
              if (sellAmount > 0) {
                await sleep(randomDelay());
                await trySwap({
                  user,
                  walletKeypair: wallet,
                  inputMint: tokenMint,
                  outputMint: SOL_MINT,
                  uiAmount: sellAmount,
                  mode: 'growth',
                  action: 'bot-sell',
                });
              }
            }
            await sleep(randomDelay());
          }
          break;

        case 'moonshot':
          for (const wallet of wallets) {
            if (runningBots.get(userId)?.stop) return;
            await trySwap({
              user,
              walletKeypair: wallet,
              inputMint: SOL_MINT,
              outputMint: tokenMint,
              uiAmount: randomAmount(),
              mode: 'moonshot',
              action: 'bot-buy',
            });
            await sleep(randomDelay());
          }
          break;

        case 'human': {
          if (wallets.length < 2) {
            await sleep(3000);
            break;
          }
          const shuffled = [...wallets].sort(() => Math.random() - 0.5);
          const groupSize = Math.min(shuffled.length, Math.max(2, Math.floor(Math.random() * Math.min(5, shuffled.length)) + 1));
          const group = shuffled.slice(0, groupSize);
          const sells = [];

          for (const wallet of group) {
            if (runningBots.get(userId)?.stop) return;
            const buy = await trySwap({
              user,
              walletKeypair: wallet,
              inputMint: SOL_MINT,
              outputMint: tokenMint,
              uiAmount: randomAmount(),
              mode: 'human',
              action: 'bot-buy',
            });
            if (buy && buy.output.uiAmount > 0) {
              sells.push({ wallet, amount: buy.output.uiAmount });
            }
            await sleep(Math.random() * 5000);
          }

          await sleep(15000 + Math.random() * 15000);

          for (const sell of sells) {
            if (runningBots.get(userId)?.stop) return;
            await trySwap({
              user,
              walletKeypair: sell.wallet,
              inputMint: tokenMint,
              outputMint: SOL_MINT,
              uiAmount: sell.amount,
              mode: 'human',
              action: 'bot-sell',
            });
          }
          break;
        }

        case 'bump':
          for (const wallet of wallets) {
            if (runningBots.get(userId)?.stop) return;
            const amount = randomAmount();
            const buy = await trySwap({
              user,
              walletKeypair: wallet,
              inputMint: SOL_MINT,
              outputMint: tokenMint,
              uiAmount: amount,
              mode: 'bump',
              action: 'bot-buy',
            });
            if (buy && buy.output.uiAmount > 0) {
              await sleep(randomDelay());
              await trySwap({
                user,
                walletKeypair: wallet,
                inputMint: tokenMint,
                outputMint: SOL_MINT,
                uiAmount: buy.output.uiAmount,
                mode: 'bump',
                action: 'bot-sell',
              });
            }
            await sleep(randomDelay());
          }
          break;

        default:
          await sleep(2000);
      }
    } catch (err) {
      console.error(`[bot ${userId}] loop error:`, err?.message || err);
    }

    for (let i = 0; i < 20; i += 1) {
      const ctlCheck = runningBots.get(userId);
      if (!ctlCheck || ctlCheck.stop) return;
      await sleep(1000);
    }
  }
}

const startBot = async (userId) => {
  const id = userId.toString();
  const user = await User.findById(id);
  if (!user || user.running) return;

  user.running = true;
  await user.save();

  if (runningBots.has(id)) {
    runningBots.get(id).stop = false;
    return;
  }

  runningBots.set(id, { stop: false });
  botLoop(id).finally(() => {
    runningBots.delete(id);
    User.findByIdAndUpdate(id, { running: false }).catch(() => {});
  });
};

const stopBot = async (userId) => {
  const id = userId.toString();
  const ctl = runningBots.get(id);
  if (ctl) ctl.stop = true;
  await User.findByIdAndUpdate(id, { running: false }).catch(() => {});
};

module.exports = { startBot, stopBot, runningBots };

