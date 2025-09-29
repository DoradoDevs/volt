// backend/src/routes.js
const express = require('express');

const { authLimiter } = require('./middleware/ratelimit');
const authRequired = require('./middleware/auth');

// Auth controllers
const { signup, login, verify, me } = require('./controllers/auth');

// App controllers
const {
  // overview
  getDashboard,
  // referrals
  manageReferral,
  getTier,
  // wallets
  listWallets,
  manageWallets,
  addOneWallet,
  removeWalletByAddress,
  getDepositAddress,
  newDepositAddress,
  setActiveWallets,
  // funds
  depositWithdraw,
  distribute,
  consolidate,
  sellAll,
  closeAccounts,
  // bot + settings
  startBotController,
  stopBotController,
  updateSettings,
  getSettings,
  // portfolio
  portfolio,
  // activity + health
  getActivity,
  health,
} = require('./controllers/dashboard');

const router = express.Router();

/** ---------- Public auth (rate-limited) ---------- **/
router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);
router.post('/verify', authLimiter, verify);

/** ---------- Identity/bootstrap ---------- **/
router.get('/auth/me', authRequired, me);
router.get('/dashboard', authRequired, getDashboard);

/** ---------- Wallets & Portfolio ---------- **/
router.get('/wallets/list', authRequired, listWallets);
router.post('/wallets/add-one', authRequired, addOneWallet);
router.post('/wallets/remove-one', authRequired, removeWalletByAddress);
router.get('/wallets/deposit-address', authRequired, getDepositAddress);
router.post('/wallets/deposit-new', authRequired, newDepositAddress);
router.post('/wallets/active', authRequired, setActiveWallets);
router.get('/portfolio', authRequired, portfolio);

/** ---------- Referrals ---------- **/
router.post('/referral/claim', authRequired, manageReferral);
router.get('/tier', authRequired, getTier);

/** ---------- Wallet admin + funds ---------- **/
router.post('/wallets/manage', authRequired, manageWallets);
router.post('/funds/deposit-withdraw', authRequired, depositWithdraw);
router.post('/funds/distribute', authRequired, distribute);
router.post('/funds/consolidate', authRequired, consolidate);
router.post('/funds/sell-all', authRequired, sellAll);
router.post('/funds/close-accounts', authRequired, closeAccounts);

/** ---------- Bot + settings ---------- **/
router.post('/bot/start', authRequired, startBotController);
router.post('/bot/stop', authRequired, stopBotController);
router.post('/settings/update', authRequired, updateSettings);
router.get('/settings/get', authRequired, getSettings);

/** ---------- Activity + health ---------- **/
router.get('/activity', authRequired, getActivity);
router.get('/health', health);

module.exports = router;
