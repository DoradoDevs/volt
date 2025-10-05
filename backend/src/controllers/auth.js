// backend/src/controllers/auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const web3 = require('@solana/web3.js');
const bs58 = require('bs58');

const User = require('../models/user');
const { encrypt } = require('../services/solana');

const tokenFor = (userId) => jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });

async function ensureDepositWallet(user) {
  if (!user.sourceEncrypted) {
    const kp = web3.Keypair.generate();
    user.sourceEncrypted = encrypt(bs58.encode(kp.secretKey));
  }
}

/** POST /signup { username, password, referrer? } */
const signup = async (req, res) => {
  const { username, password, referrer } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = await User.findOne({ username });
  if (existing) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const referralCode = crypto.randomBytes(3).toString('hex');

  const user = await User.create({
    username,
    password: hashedPassword,
    referralCode,
    referrer: referrer || 'ddc3b4', // Default referral code
  });

  await ensureDepositWallet(user);
  await user.save();

  const token = tokenFor(user._id.toString());
  res.json({ token, user: { username: user.username } });
};

/** POST /login { username, password } */
const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = await User.findOne({ username });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = tokenFor(user._id.toString());
  res.json({ token, user: { username: user.username } });
};

/** GET /auth/me */
const me = async (req, res) => {
  const user = await User.findById(req.userId).lean();
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ username: user.username });
};

module.exports = { signup, login, me };
