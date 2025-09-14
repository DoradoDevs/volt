const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');

const logFile = 'signup.log';
const log = (message) => fs.appendFileSync(logFile, `${new Date().toISOString()} - ${message}\n`);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendVerificationEmail = async (email, code) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Verify Your VolT Account',
    text: `Your verification code is ${code}`,
  };
  await transporter.sendMail(mailOptions);
};

const signup = async (req, res) => {
  log(`Signup attempt: ${JSON.stringify(req.body)}`);
  const { email, password, referrer } = req.body;
  if (!email || !password) {
    log(`Missing fields: ${JSON.stringify({ email, password })}`);
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      log(`User exists: ${email}`);
      return res.status(400).json({ error: 'User exists' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const verificationCode = crypto.randomBytes(3).toString('hex');
    const referralCode = crypto.randomBytes(3).toString('hex');
    const user = new User({ email, password: hashed, verificationCode, referralCode, referrer });
    await user.save();
    log(`User saved: ${JSON.stringify({ email, referralCode })}`);
    await sendVerificationEmail(email, verificationCode);
    log(`Verification email sent to: ${email}`);
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    log(`Token generated: ${token.substring(0, 10)}...`);
    res.json({ token });
  } catch (err) {
    log(`Signup error: ${err.message}\n${err.stack}`);
    res.status(500).json({ error: 'Signup failed' + (err.message ? `: ${err.message}` : '') });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  if (!user.verified) {
    return res.status(400).json({ error: 'Please verify your email' });
  }
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token, user: { email: user.email, tier: user.tier } });
};

const verify = async (req, res) => {
  const { code } = req.body;
  const user = await User.findOne({ verificationCode: code });
  if (!user) return res.status(400).json({ error: 'Invalid code' });
  user.verified = true;
  user.verificationCode = null;
  await user.save();
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token });
};

module.exports = { signup, login, verify };