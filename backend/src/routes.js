const express = require('express');
const { signup, login, verify } = require('./controllers/auth');
const { getDashboard, manageReferral, getTier, manageWallets, depositWithdraw, distribute, consolidate, sellAll, closeAccounts, startBotController, stopBotController, updateSettings } = require('./controllers/dashboard');
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/verify', verify);

// Protected
router.get('/dashboard', authMiddleware, getDashboard);
router.post('/referral/claim', authMiddleware, manageReferral);
router.get('/tier', authMiddleware, getTier);
router.post('/wallets/manage', authMiddleware, manageWallets);
router.post('/funds/deposit-withdraw', authMiddleware, depositWithdraw);
router.post('/funds/distribute', authMiddleware, distribute);
router.post('/funds/consolidate', authMiddleware, consolidate);
router.post('/funds/sell-all', authMiddleware, sellAll);
router.post('/funds/close-accounts', authMiddleware, closeAccounts);
router.post('/bot/start', authMiddleware, startBotController);
router.post('/bot/stop', authMiddleware, stopBotController);
router.post('/settings/update', authMiddleware, updateSettings);

module.exports = router;