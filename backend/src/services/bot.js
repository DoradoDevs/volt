const { performSwap, getKeypair } = require('./solana');
const User = require('../models/user');
const TxLog = require('../models/txlog');
const web3 = require('@solana/web3.js');

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TOKEN_PROGRAM_ID = new web3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

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

// Verify wallet has tokens after a buy
async function verifyTokenBalance(connection, walletPubkey, tokenMint, expectedAmount, maxRetries = 5) {
  const mintPubkey = new web3.PublicKey(tokenMint);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { value } = await connection.getParsedTokenAccountsByOwner(
        walletPubkey,
        { programId: TOKEN_PROGRAM_ID }
      );

      let totalBalance = 0;
      for (const acc of value) {
        const info = acc.account.data.parsed.info;
        if (info.mint === mintPubkey.toString()) {
          totalBalance += Number(info.tokenAmount.uiAmount) || 0;
        }
      }

      if (totalBalance > 0) {
        console.log(`[verifyTokenBalance] Found ${totalBalance} tokens in wallet (expected ~${expectedAmount})`);
        return totalBalance;
      }

      // Tokens not found yet, wait and retry
      console.log(`[verifyTokenBalance] Attempt ${attempt + 1}/${maxRetries}: No tokens found yet, waiting 1s...`);
      await sleep(1000);
    } catch (err) {
      console.warn(`[verifyTokenBalance] Error on attempt ${attempt + 1}:`, err?.message || err);
      if (attempt < maxRetries - 1) {
        await sleep(1000);
      }
    }
  }

  console.warn(`[verifyTokenBalance] Failed to verify tokens after ${maxRetries} attempts`);
  return 0;
}

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

    // Check if we're rate limited and need to wait
    if (ctl && ctl.rateLimitedUntil && Date.now() < ctl.rateLimitedUntil) {
      const waitMs = ctl.rateLimitedUntil - Date.now();
      console.log(`[bot ${user._id}] rate limited, waiting ${Math.ceil(waitMs / 1000)}s before retry...`);
      await sleep(waitMs);
    }

    try {
      const result = await performSwap(user, walletKeypair, inputMint, outputMint, uiAmount, 0.5, context);

      // Success - reset rate limit tracking
      if (ctl) {
        ctl.rateLimitHits = 0;
        ctl.rateLimitedUntil = null;
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

      // Check for rate limiting (429)
      if (errMsg.includes('429') || errMsg.includes('Too Many Requests') || errMsg.includes('Rate limit')) {
        if (ctl) {
          ctl.rateLimitHits = (ctl.rateLimitHits || 0) + 1;
          // Exponential backoff: 2s, 5s, 10s, 20s, 30s
          const backoffSeconds = Math.min(30, Math.pow(2, ctl.rateLimitHits) * 2);
          ctl.rateLimitedUntil = Date.now() + (backoffSeconds * 1000);
          console.warn(`[bot ${user._id}] RATE LIMITED (hit #${ctl.rateLimitHits}), backing off for ${backoffSeconds}s`);

          // After 3 rate limit hits, suggest custom RPC
          if (ctl.rateLimitHits >= 3 && !ctl.rpcSuggestionShown) {
            console.warn(`[bot ${user._id}] ⚠️  RECOMMENDATION: Consider using a custom/private RPC endpoint to avoid rate limits. Your current delays (${user.minDelay}-${user.maxDelay}ms) are too aggressive for public APIs.`);
            ctl.rpcSuggestionShown = true;
          }
        }
        await sleep(2000); // Initial 2s wait before retry
        continue;
      }

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

    // Track successful swaps to detect if bot should stop due to insufficient funds
    let successfulSwaps = 0;

    try {
      switch (mode) {
        case 'pure': {
          // Pure mode: Buy then sell ENTIRE token balance
          // First ever buy uses tiny amount (0.0001 SOL) to test, then normal amounts
          const walletAddr = wallet => wallet.publicKey.toBase58();
          const rpcEndpoint = user.rpc || process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
          const connection = new web3.Connection(rpcEndpoint, { commitment: 'confirmed' });

          // Initialize first buy flag if not set
          if (controller.pureFirstBuyDone === undefined) {
            controller.pureFirstBuyDone = false;
            console.log(`[bot ${user._id}] pure mode: initialized, first buy will be 0.0001 SOL`);
          }

          for (const wallet of wallets) {
            if (controller.stop) return;

            // Determine buy amount: very first buy ever is tiny, all others are normal
            let buyAmount;
            if (!controller.pureFirstBuyDone) {
              buyAmount = 0.0001; // Tiny first buy
              console.log(`[bot ${user._id}] pure mode: FIRST BUY EVER - using ${buyAmount} SOL for ${walletAddr(wallet)}`);
              controller.pureFirstBuyDone = true; // Mark as done immediately
            } else {
              buyAmount = randomAmount(); // Normal amounts from user settings
            }

            // Buy
            console.log(`[bot ${user._id}] pure mode: buying ${buyAmount} SOL on ${walletAddr(wallet)}`);
            const buy = await trySwap({
              user,
              walletKeypair: wallet,
              inputMint: SOL_MINT,
              outputMint: tokenMint,
              uiAmount: buyAmount,
              mode: 'pure',
              action: 'bot-buy',
              controller,
            });

            if (controller.stop) return;

            if (buy && buy.output.uiAmount > 0) {
              successfulSwaps++;
              console.log(`[bot ${user._id}] pure mode: buy successful, got ${buy.output.uiAmount} tokens`);
            } else {
              console.warn(`[bot ${user._id}] pure mode: buy failed or returned 0 tokens`);
            }

            // Delay before checking balance
            await sleep(randomDelay());
            if (controller.stop) return;

            // Get ENTIRE token balance in wallet
            console.log(`[bot ${user._id}] pure mode: checking token balance for ${walletAddr(wallet)}`);
            const fullBalance = await verifyTokenBalance(
              connection,
              wallet.publicKey,
              tokenMint,
              buy?.output?.uiAmount || 0
            );

            if (fullBalance > 0) {
              console.log(`[bot ${user._id}] pure mode: found ${fullBalance} tokens, selling...`);

              const sell = await trySwap({
                user,
                walletKeypair: wallet,
                inputMint: tokenMint,
                outputMint: SOL_MINT,
                uiAmount: fullBalance,
                mode: 'pure',
                action: 'bot-sell',
                controller,
              });

              if (sell) {
                successfulSwaps++;
                console.log(`[bot ${user._id}] pure mode: sell successful`);
              } else {
                console.warn(`[bot ${user._id}] pure mode: sell failed for ${walletAddr(wallet)}, tokens will be sold next cycle`);
              }
            } else {
              console.warn(`[bot ${user._id}] pure mode: no tokens found in ${walletAddr(wallet)}`);
            }

            await sleep(randomDelay());
            if (controller.stop) return;
          }

          console.log(`[bot ${user._id}] pure mode: cycle complete, looping...`);
          break;
        }

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
              successfulSwaps++;
              const sellAmount = buy.output.uiAmount * 0.9;
              if (sellAmount > 0) {
                await sleep(randomDelay());
                if (controller.stop) return;
                const sell = await trySwap({
                  user,
                  walletKeypair: wallet,
                  inputMint: tokenMint,
                  outputMint: SOL_MINT,
                  uiAmount: sellAmount,
                  mode: 'growth',
                  action: 'bot-sell',
                  controller,
                });
                if (sell) successfulSwaps++;
              }
            }
            await sleep(randomDelay());
            if (controller.stop) return;
          }
          break;

        case 'moonshot':
          for (const wallet of wallets) {
            if (controller.stop) return;
            const buy = await trySwap({
              user,
              walletKeypair: wallet,
              inputMint: SOL_MINT,
              outputMint: tokenMint,
              uiAmount: randomAmount(),
              mode: 'moonshot',
              action: 'bot-buy',
              controller,
            });
            if (buy) successfulSwaps++;
            if (controller.stop) return;
            await sleep(randomDelay());
          }
          break;

        case 'human': {
          // Human mode: fully randomized patterns with consecutive buy tracking
          // Rule: If a wallet buys 2x in a row, it MUST sell next time it's selected
          if (wallets.length === 0) {
            await sleep(3000);
            break;
          }

          // Initialize wallet state tracker (wallet address -> {tokens: number, consecutiveBuys: number})
          if (!controller.humanState) {
            controller.humanState = new Map();
          }
          const walletState = controller.humanState;

          // Helper: track buy for wallet
          const recordBuy = (wallet, tokens) => {
            const addr = wallet.publicKey.toBase58();
            const state = walletState.get(addr) || { tokens: 0, consecutiveBuys: 0 };
            state.tokens += tokens;
            state.consecutiveBuys += 1;
            walletState.set(addr, state);
            if (state.consecutiveBuys >= 2) {
              console.log(`[human] ${addr} bought 2x in a row, must sell next`);
            }
          };

          // Helper: track sell for wallet
          const recordSell = (wallet) => {
            const addr = wallet.publicKey.toBase58();
            const state = walletState.get(addr) || { tokens: 0, consecutiveBuys: 0 };
            state.tokens = 0;
            state.consecutiveBuys = 0;
            walletState.set(addr, state);
          };

          // Helper: check if wallet must sell (bought 2x in a row)
          const mustSell = (wallet) => {
            const addr = wallet.publicKey.toBase58();
            const state = walletState.get(addr);
            return state && state.consecutiveBuys >= 2 && state.tokens > 0;
          };

          // Helper: can wallet buy (hasn't bought 2x in a row, or has sold since)
          const canBuy = (wallet) => {
            const addr = wallet.publicKey.toBase58();
            const state = walletState.get(addr);
            return !state || state.consecutiveBuys < 2;
          };

          const shuffled = [...wallets].sort(() => Math.random() - 0.5);
          const maxWallets = Math.min(wallets.length, shuffled.length);
          const pattern = Math.floor(Math.random() * 5);

          if (pattern === 0) {
            // Pattern 1: Pure mode behavior (buy->sell each wallet)
            const numWallets = Math.min(maxWallets, 1 + Math.floor(Math.random() * maxWallets));
            for (let i = 0; i < numWallets; i++) {
              if (controller.stop) return;
              const wallet = shuffled[i];

              const buy = await trySwap({
                user, walletKeypair: wallet, inputMint: SOL_MINT, outputMint: tokenMint,
                uiAmount: randomAmount(), mode: 'human', action: 'bot-buy', controller,
              });
              if (controller.stop) return;
              if (buy && buy.output.uiAmount > 0) {
                successfulSwaps++;
                recordBuy(wallet, buy.output.uiAmount);
                await sleep(randomDelay());
                if (controller.stop) return;

                const sell = await trySwap({
                  user, walletKeypair: wallet, inputMint: tokenMint, outputMint: SOL_MINT,
                  uiAmount: buy.output.uiAmount, mode: 'human', action: 'bot-sell', controller,
                });
                if (sell) {
                  successfulSwaps++;
                  recordSell(wallet);
                }
              }
              await sleep(randomDelay());
              if (controller.stop) return;
            }
          } else if (pattern === 1) {
            // Pattern 2: Random buys and sells with tracking
            const operations = Math.min(maxWallets * 2, 5 + Math.floor(Math.random() * 10));
            for (let i = 0; i < operations; i++) {
              if (controller.stop) return;

              // Check if any wallet MUST sell
              const forcedSellWallet = shuffled.find(w => mustSell(w));
              if (forcedSellWallet) {
                const state = walletState.get(forcedSellWallet.publicKey.toBase58());
                const sell = await trySwap({
                  user, walletKeypair: forcedSellWallet, inputMint: tokenMint, outputMint: SOL_MINT,
                  uiAmount: state.tokens, mode: 'human', action: 'bot-sell', controller,
                });
                if (sell) {
                  successfulSwaps++;
                  recordSell(forcedSellWallet);
                }
              } else {
                // Random action: 60% buy, 40% sell
                const action = Math.random();
                if (action < 0.6) {
                  // Buy with random wallet that can buy
                  const buyableWallets = shuffled.filter(w => canBuy(w));
                  if (buyableWallets.length > 0) {
                    const wallet = buyableWallets[Math.floor(Math.random() * buyableWallets.length)];
                    const buy = await trySwap({
                      user, walletKeypair: wallet, inputMint: SOL_MINT, outputMint: tokenMint,
                      uiAmount: randomAmount(), mode: 'human', action: 'bot-buy', controller,
                    });
                    if (buy && buy.output.uiAmount > 0) {
                      successfulSwaps++;
                      recordBuy(wallet, buy.output.uiAmount);
                    }
                  }
                } else {
                  // Sell with random wallet that has tokens
                  const sellableWallets = shuffled.filter(w => {
                    const state = walletState.get(w.publicKey.toBase58());
                    return state && state.tokens > 0;
                  });
                  if (sellableWallets.length > 0) {
                    const wallet = sellableWallets[Math.floor(Math.random() * sellableWallets.length)];
                    const state = walletState.get(wallet.publicKey.toBase58());
                    const sell = await trySwap({
                      user, walletKeypair: wallet, inputMint: tokenMint, outputMint: SOL_MINT,
                      uiAmount: state.tokens, mode: 'human', action: 'bot-sell', controller,
                    });
                    if (sell) {
                      successfulSwaps++;
                      recordSell(wallet);
                    }
                  }
                }
              }
              await sleep(randomDelay());
              if (controller.stop) return;
            }

            // Cleanup: sell all remaining holdings
            for (const wallet of shuffled) {
              const state = walletState.get(wallet.publicKey.toBase58());
              if (state && state.tokens > 0) {
                const sell = await trySwap({
                  user, walletKeypair: wallet, inputMint: tokenMint, outputMint: SOL_MINT,
                  uiAmount: state.tokens, mode: 'human', action: 'bot-sell', controller,
                });
                if (sell) {
                  successfulSwaps++;
                  recordSell(wallet);
                }
                await sleep(randomDelay());
                if (controller.stop) return;
              }
            }
          } else if (pattern === 2) {
            // Pattern 3: Batch buys with delayed sells
            const groupSize = Math.min(maxWallets, 1 + Math.floor(Math.random() * maxWallets));
            for (let i = 0; i < groupSize; i++) {
              if (controller.stop) return;
              const wallet = shuffled[i];

              // Force sell if wallet bought 2x already
              if (mustSell(wallet)) {
                const state = walletState.get(wallet.publicKey.toBase58());
                const sell = await trySwap({
                  user, walletKeypair: wallet, inputMint: tokenMint, outputMint: SOL_MINT,
                  uiAmount: state.tokens, mode: 'human', action: 'bot-sell', controller,
                });
                if (sell) {
                  successfulSwaps++;
                  recordSell(wallet);
                }
              } else if (canBuy(wallet)) {
                const buy = await trySwap({
                  user, walletKeypair: wallet, inputMint: SOL_MINT, outputMint: tokenMint,
                  uiAmount: randomAmount(), mode: 'human', action: 'bot-buy', controller,
                });
                if (buy && buy.output.uiAmount > 0) {
                  successfulSwaps++;
                  recordBuy(wallet, buy.output.uiAmount);
                }
              }
              await sleep(randomDelay());
              if (controller.stop) return;
            }

            // Wait before selling
            await sleep(randomDelay() * 2);
            if (controller.stop) return;

            // Sell all holdings
            for (const wallet of shuffled) {
              const state = walletState.get(wallet.publicKey.toBase58());
              if (state && state.tokens > 0) {
                const sell = await trySwap({
                  user, walletKeypair: wallet, inputMint: tokenMint, outputMint: SOL_MINT,
                  uiAmount: state.tokens, mode: 'human', action: 'bot-sell', controller,
                });
                if (sell) {
                  successfulSwaps++;
                  recordSell(wallet);
                }
                await sleep(randomDelay());
                if (controller.stop) return;
              }
            }
          } else if (pattern === 3) {
            // Pattern 4: Single wallet rapid cycles
            const wallet = shuffled[0];
            const rounds = 1 + Math.floor(Math.random() * 3);
            for (let i = 0; i < rounds; i++) {
              if (controller.stop) return;

              const buy = await trySwap({
                user, walletKeypair: wallet, inputMint: SOL_MINT, outputMint: tokenMint,
                uiAmount: randomAmount(), mode: 'human', action: 'bot-buy', controller,
              });
              if (buy && buy.output.uiAmount > 0) {
                successfulSwaps++;
                recordBuy(wallet, buy.output.uiAmount);
                await sleep(randomDelay());
                if (controller.stop) return;

                const sell = await trySwap({
                  user, walletKeypair: wallet, inputMint: tokenMint, outputMint: SOL_MINT,
                  uiAmount: buy.output.uiAmount, mode: 'human', action: 'bot-sell', controller,
                });
                if (sell) {
                  successfulSwaps++;
                  recordSell(wallet);
                }
              }
              await sleep(randomDelay());
              if (controller.stop) return;
            }
          } else {
            // Pattern 5: Mixed mode with forced sells
            const numOps = Math.min(maxWallets * 2, 4 + Math.floor(Math.random() * 8));
            for (let i = 0; i < numOps; i++) {
              if (controller.stop) return;

              const wallet = shuffled[i % shuffled.length];

              if (mustSell(wallet)) {
                // Forced sell
                const state = walletState.get(wallet.publicKey.toBase58());
                const sell = await trySwap({
                  user, walletKeypair: wallet, inputMint: tokenMint, outputMint: SOL_MINT,
                  uiAmount: state.tokens, mode: 'human', action: 'bot-sell', controller,
                });
                if (sell) {
                  successfulSwaps++;
                  recordSell(wallet);
                }
              } else if (canBuy(wallet) && Math.random() < 0.7) {
                // Buy
                const buy = await trySwap({
                  user, walletKeypair: wallet, inputMint: SOL_MINT, outputMint: tokenMint,
                  uiAmount: randomAmount(), mode: 'human', action: 'bot-buy', controller,
                });
                if (buy && buy.output.uiAmount > 0) {
                  successfulSwaps++;
                  recordBuy(wallet, buy.output.uiAmount);
                }
              } else {
                // Sell if has tokens
                const state = walletState.get(wallet.publicKey.toBase58());
                if (state && state.tokens > 0) {
                  const sell = await trySwap({
                    user, walletKeypair: wallet, inputMint: tokenMint, outputMint: SOL_MINT,
                    uiAmount: state.tokens, mode: 'human', action: 'bot-sell', controller,
                  });
                  if (sell) {
                    successfulSwaps++;
                    recordSell(wallet);
                  }
                }
              }
              await sleep(randomDelay());
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
              successfulSwaps++;
              await sleep(randomDelay());
              if (controller.stop) return;
              const sell = await trySwap({
                user,
                walletKeypair: wallet,
                inputMint: tokenMint,
                outputMint: SOL_MINT,
                uiAmount: buy.output.uiAmount,
                mode: 'bump',
                action: 'bot-sell',
                controller,
              });
              if (sell) successfulSwaps++;
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

    // If no successful swaps in this cycle, warn but keep trying for 3 failed cycles
    if (successfulSwaps === 0 && wallets.length > 0) {
      controller.failedCycles = (controller.failedCycles || 0) + 1;
      console.warn(`[bot ${userId}] no successful swaps this cycle (failed cycles: ${controller.failedCycles})`);

      // Only check balances after 3 consecutive failed cycles (avoid slowing down the bot)
      if (controller.failedCycles >= 3) {
        console.log(`[bot ${userId}] 3 failed cycles, checking if wallets have sufficient SOL...`);
        const web3 = require('@solana/web3.js');
        const rpcEndpoint = user.rpc || process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
        const connection = new web3.Connection(rpcEndpoint, { commitment: 'confirmed' });
        let hasEnoughSol = false;
        const requiredSol = minBuy + 0.005; // minBuy + estimated fees

        // Check first 3 wallets only (faster check)
        const walletsToCheck = wallets.slice(0, Math.min(3, wallets.length));

        for (const wallet of walletsToCheck) {
          try {
            const balance = await connection.getBalance(wallet.publicKey);
            const solBalance = balance / web3.LAMPORTS_PER_SOL;

            if (solBalance >= requiredSol) {
              hasEnoughSol = true;
              console.log(`[bot ${userId}] wallet ${wallet.publicKey.toBase58()}: ${solBalance.toFixed(6)} SOL - sufficient`);
              break;
            }
          } catch (err) {
            console.warn(`[bot ${userId}] balance check failed for ${wallet.publicKey.toBase58()}:`, err?.message || err);
          }
        }

        if (!hasEnoughSol) {
          console.log(`[bot ${userId}] stopping: insufficient SOL across checked wallets (min required: ${requiredSol.toFixed(6)} SOL)`);
          heartbeat(controller, {
            lastError: {
              ts: Date.now(),
              message: `Bot stopped: Insufficient SOL. Minimum required: ${requiredSol.toFixed(6)} SOL per wallet.`
            }
          });
          controller.stop = true;
          await User.findByIdAndUpdate(userId, { running: false }).catch(() => {});
          return;
        } else {
          console.log(`[bot ${userId}] sufficient SOL found, resetting failed cycle counter`);
          controller.failedCycles = 0;
        }
      }
    } else if (successfulSwaps > 0) {
      // Reset failed cycle counter on successful swaps
      controller.failedCycles = 0;
    }

    heartbeat(controller, { phase: 'cooldown' });
    // Minimal cooldown between cycles to ensure near-instant loop continuation
    const cooldownMs = 100 + Math.random() * 400;
    await sleep(cooldownMs);
    if (!controller || controller.stop) return;
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
      rateLimitHits: 0,
      rateLimitedUntil: null,
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

