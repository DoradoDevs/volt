const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { sendEmail } = require('../config/email');
const { encrypt, getKeypair } = require('../services/solana');
const web3 = require('@solana/web3.js');
const { v4: uuid } = require('uuid');

const signup = async (req, res) => {
  const { email, password, referrerCode } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const referralCode = uuid().slice(0, 8);
  let referrer = null;
  if (referrerCode) referrer = await User.findOne({ referralCode })._id;

  const sourceKp = web3.Keypair.generate();
  const encryptedSource = encrypt(bs58.encode(sourceKp.secretKey));

  const user = new User({ email, passwordHash: hash, referralCode, referrer, sourceEncrypted: encryptedSource });
  await user.save();
  res.json({ message: 'Signed up' });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid creds' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.verificationCode = code;
  await user.save();
  await sendEmail(email, 'VolT Verification', `Code: ${code}`);
  res.json({ message: 'Code sent' });
};

const verify = async (req, res) => {
  const { email, code } = req.body;
  const user = await User.findOne({ email, verificationCode: code });
  if (!user) return res.status(401).json({ error: 'Invalid code' });

  user.verificationCode = null;
  await user.save();
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token });
};
module.exports = { signup, login, verify };