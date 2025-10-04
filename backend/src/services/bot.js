const { performSwap, getKeypair } = require('./solana');
const User = require('../models/user');
const TxLog = require('../models/txlog');

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const runningBots = new Map(); // userId -> controller state

const heartbeat = (controller, patch = {}) => {
  if (!controller) return;
  controller.lastHeartbeat = Date.now();
  Object.assign(controller, patch);
};

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

async function trySwap({ user, walletKeypair, inputMint, outputMint, uiAmount, mode, action, controller }) {
  const context = { inputMint, outputMint, mode, action };
  const ctl = controller || runningBots.get(user._id.toString());
  let lastError;
  const walletAddress = walletKeypair.publicKey.toBase58();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (ctl?.stop) break;
    try {
      const result = await performSwap(user, walletKeypair, inputMint, outputMint, uiAmount, 0.5, context);
      if (ctl) {
        ctl.lastAction = {
          ts: Date.now(),
          wallet: walletAddress,
          mode,
          action,
          inputMint,
          outputMint,
          amount: Number(uiAmount) || 0,
          success: true,
          attempt,
        };
      }
      return result;
    } catch (err) {
      lastError = err;
      const errMsg = err?.message || String(err);

      if (ctl) {
        const payload = {
          ts: Date.now(),
          wallet: walletAddress,
          mode,
          action,
          inputMint,
          outputMint,
          amount: Number(uiAmount) || 0,
          success: false,
          attempt,
          error: errMsg,
        };
        ctl.lastAction = payload;
        ctl.lastError = payload;
      }

      console.warn(`[bot ${user._id}] ${action} attempt ${attempt + 1} failed for ${walletAddress}: ${errMsg}`);
      await logSwapError(user._id, walletAddress, context, err, uiAmount);

      // Don't retry if it's a known unrecoverable error
      if (errMsg.includes('Slippage tolerance exceeded') ||
          errMsg.includes('insufficient funds') ||
          errMsg.includes('0x1')) { // Program error
        console.warn(`[bot ${user._id}] unrecoverable error, skipping retries`);
        break;
      }

      await sleep(400 * Math.pow(2, attempt));
      if (!ctl || ctl.stop) break;
    }
  }
  if (lastError) {
    console.error(`[bot ${user._id}] swap failed after retries:`, lastError?.message || lastError);
  }
  return null;
}

async function botLoop(userId, controller) {
  console.log(`[bot ${userId}] loop entered`);
  while (true) {
    if (runningBots.get(userId) !== controller) {
      console.log(`[bot ${userId}] controller handle swapped, exiting`);
      return;
    }
    if (!controller || controller.stop) {
      console.log(`[bot ${userId}] stop flag detected`);
      return;
    }

    heartbeat(controller, { phase: 'load-user' });

    let user;
    try {
      user = await User.findById(userId);
    } catch (err) {
      console.warn(`[bot ${userId}] failed to load user:`, err?.message || err);
      heartbeat(controller, { lastError: { ts: Date.now(), message: err?.message || String(err) } });
      await sleep(1500);
      continue;
    }

    if (!user || !user.running) {
      console.log(`[bot ${userId}] user record missing or running flag cleared`);
      return;
    }

    const tokenMint = (user.tokenMint || '').trim();
    if (!BASE58_RE.test(tokenMint)) {
      console.warn(`[bot ${userId}] invalid token mint`, tokenMint);
      heartbeat(controller, { lastError: { ts: Date.now(), message: 'Invalid token mint', tokenMint } });
      await sleep(3000);
      continue;
    }

    const wallets = getActiveKeypairs(user);
    const mode = (user.mode || 'pure').toLowerCase();
    heartbeat(controller, { phase: 'active', mode, walletCount: wallets.length });

    if (!wallets.length) {
      console.log(`[bot ${userId}] no active wallets`);
      await sleep(2500);
      continue;
    }

    const minBuy = Math.max(0.00001, parseNumber(user.minBuy, 0.01));
    const maxBuy = Math.max(minBuy, parseNumber(user.maxBuy, minBuy));
    const minDelay = Math.max(250, parseNumber(user.minDelay, 1000));
    const maxDelay = Math.max(minDelay, parseNumber(user.maxDelay, minDelay + 1000));

    const randomAmount = () => Math.max(minBuy, Math.random() * (maxBuy - minBuy) + minBuy);
    const randomDelay = () => Math.random() * (maxDelay - minDelay) + minDelay;

    try {
      switch (mode) {
        case 'pure':
          for (const wallet of wallets) {
            if (controller.stop) return;
            const buy = await trySwap({
              user,
              walletKeypair: wallet,
              inputMint: SOL_MINT,
              outputMint: tokenMint,
              uiAmount: randomAmount(),
              mode: 'pure',
              action: 'bot-buy',
              controller,
            });
            if (controller.stop) return;
            if (buy && buy.output.uiAmount > 0) {
              await sleep(randomDelay());
              if (controller.stop) return;
              const sell = await trySwap({
                user,
                walletKeypair: wallet,
                inputMint: tokenMint,
                outputMint: SOL_MINT,
                uiAmount: buy.output.uiAmount,
                mode: 'pure',
                action: 'bot-sell',
                controller,
              });
              // If sell failed, log it but continue
              if (!sell) {
                console.warn(`[bot ${user._id}] pure mode: sell failed for wallet ${wallet.publicKey.toBase58()}, continuing to next wallet`);
              }
            } else {
              console.warn(`[bot ${user._id}] pure mode: buy failed or returned 0 output, skipping sell`);
            }
            await sleep(randomDelay());
            if (controller.stop) return;
          }
          break;

        case 'growth':
          for (const wallet of wallets) {
            if (controller.stop) return;
            const buy = await trySwap({
              user,
              walletKeypair: wallet,
              inputMint: SOL_MINT,
              outputMint: tokenMint,
              uiAmount: randomAmount(),
              mode: 'growth',
              action: 'bot-buy',
              controller,
            });
            if (controller.stop) return;
            if (buy && buy.output.uiAmount > 0) {
              const sellAmount = buy.output.uiAmount * 0.9;
              if (sellAmount > 0) {
                await sleep(randomDelay());
                if (controller.stop) return;
                await trySwap({
                  user,
                  walletKeypair: wallet,
                  inputMint: tokenMint,
                  outputMint: SOL_MINT,
                  uiAmount: sellAmount,
                  mode: 'growth',
                  action: 'bot-sell',
                  controller,
                });
              }
            }
            await sleep(randomDelay());
            if (controller.stop) return;
          }
          break;

        case 'moonshot':
          for (const wallet of wallets) {
            if (controller.stop) return;
            await trySwap({
              user,
              walletKeypair: wallet,
              inputMint: SOL_MINT,
              outputMint: tokenMint,
              uiAmount: randomAmount(),
              mode: 'moonshot',
              action: 'bot-buy',
              controller,
            });
            if (controller.stop) return;
            await sleep(randomDelay());
          }
          break;

        case 'human': {
          if (wallets.length < 2) {
            await sleep(3000);
            break;
          }
          const shuffled = [...wallets].sort(() => Math.random() - 0.5);
          const groupSize = Math.min(
            shuffled.length,
            Math.max(2, Math.floor(Math.random() * Math.min(5, shuffled.length)) + 1),
          );
          const group = shuffled.slice(0, groupSize);
          const sells = [];

          // Buy phase: quick succession with small random delays (0-5s)
          for (const wallet of group) {
            if (controller.stop) return;
            const buy = await trySwap({
              user,
              walletKeypair: wallet,
              inputMint: SOL_MINT,
              outputMint: tokenMint,
              uiAmount: randomAmount(),
              mode: 'human',
              action: 'bot-buy',
              controller,
            });
            if (controller.stop) return;
            if (buy && buy.output.uiAmount > 0) {
              sells.push({ wallet, amount: buy.output.uiAmount });
            }
            await sleep(Math.random() * 5000);
            if (controller.stop) return;
          }

          // Wait phase: 15-30 seconds before selling (humans think/wait)
          await sleep(15000 + Math.random() * 15000);
          if (controller.stop) return;

          // Sell phase: staggered sells with 3-8s delays (looks more organic)
          for (const sell of sells) {
            if (controller.stop) return;
            await trySwap({
              user,
              walletKeypair: sell.wallet,
              inputMint: tokenMint,
              outputMint: SOL_MINT,
              uiAmount: sell.amount,
              mode: 'human',
              action: 'bot-sell',
              controller,
            });
            // Add delay between sells to look more natural
            if (sells.indexOf(sell) < sells.length - 1) {
              await sleep(3000 + Math.random() * 5000);
              if (controller.stop) return;
            }
          }
          break;
        }

        case 'bump':
          for (const wallet of wallets) {
            if (controller.stop) return;
            const amount = randomAmount();
            const buy = await trySwap({
              user,
              walletKeypair: wallet,
              inputMint: SOL_MINT,
              outputMint: tokenMint,
              uiAmount: amount,
              mode: 'bump',
              action: 'bot-buy',
              controller,
            });
            if (controller.stop) return;
            if (buy && buy.output.uiAmount > 0) {
              await sleep(randomDelay());
              if (controller.stop) return;
              await trySwap({
                user,
                walletKeypair: wallet,
                inputMint: tokenMint,
                outputMint: SOL_MINT,
                uiAmount: buy.output.uiAmount,
                mode: 'bump',
                action: 'bot-sell',
                controller,
              });
            }
            await sleep(randomDelay());
            if (controller.stop) return;
          }
          break;

        default:
          await sleep(2000);
      }
    } catch (err) {
      console.error(`[bot ${userId}] loop error:`, err?.message || err);
      heartbeat(controller, { lastError: { ts: Date.now(), message: err?.message || String(err) } });
    }

    heartbeat(controller, { phase: 'cooldown' });
    for (let i = 0; i < 20; i += 1) {
      if (!controller || controller.stop) return;
      await sleep(1000);
    }
  }
}


const startBot = async (userId) => {
  const id = userId.toString();
  const user = await User.findById(id);
  if (!user) throw new Error('User not found');

  let controller = runningBots.get(id);
  let status = 'started';

  if (!user.running) {
    user.running = true;
    await user.save();
  } else {
    await User.updateOne({ _id: id }, { $set: { running: true } }).catch(() => {});
  }

  if (controller) {
    const wasStopping = controller.stop;
    controller.stop = false;
    controller.stopRequestedAt = null;
    controller.startedAt = controller.startedAt || Date.now();
    heartbeat(controller, { mode: (user.mode || 'pure').toLowerCase() });
    status = wasStopping ? 'resumed' : 'already-running';
  } else {
    controller = {
      userId: id,
      stop: false,
      startedAt: Date.now(),
      lastHeartbeat: Date.now(),
      lastAction: null,
      lastError: null,
      mode: (user.mode || 'pure').toLowerCase(),
      walletCount: Array.isArray(user.activeWallets) ? user.activeWallets.length : 0,
    };
    runningBots.set(id, controller);
    console.log(`[bot ${id}] loop starting`);
    setImmediate(() => {
      botLoop(id, controller)
        .catch((err) => {
          console.error(`[bot ${id}] loop crashed:`, err?.message || err);
        })
        .finally(() => {
          runningBots.delete(id);
          User.findByIdAndUpdate(id, { running: false }).catch(() => {});
        });
    });
  }

  heartbeat(controller, { phase: 'running' });
  return { status, controller };
};
const stopBot = async (userId) => {
  const id = userId.toString();
  const controller = runningBots.get(id);
  let status = 'not-running';
  if (controller) {
    if (controller.stop) {
      status = 'already-stopping';
    } else {
      controller.stop = true;
      controller.stopRequestedAt = Date.now();
      heartbeat(controller, { phase: 'stopping' });
      status = 'stopping';
    }
  }
  await User.findByIdAndUpdate(id, { running: false }).catch(() => {});
  return { status };
};

module.exports = { startBot, stopBot, runningBots };

