// backend/src/controllers/auth.js
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');

const logFile = 'signup.log';
const log = (m) => fs.appendFileSync(logFile, `${new Date().toISOString()} - ${m}\n`);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const sendVerificationEmail = async (email, code) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your Verification Code',
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  };
  await transporter.sendMail(mailOptions);
};

const newCode = () => crypto.randomBytes(3).toString('hex'); // 6 hex chars
const codeExpiry = () => new Date(Date.now() + 10 * 60 * 1000);
const normalize = (s='') => s.trim().toLowerCase();

const signup = async (req, res) => {
  log(`Signup attempt: ${JSON.stringify(req.body)}`);
  const email = normalize(req.body.email);
  const { referrer } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User exists' });

    const verificationCode = newCode();
    const referralCode = newCode();

    const user = new User({
      email,
      verificationCode,
      verificationCodeExpires: codeExpiry(),
      referralCode,
      referrer: referrer || null
    });

    await user.save();
    await sendVerificationEmail(email, verificationCode);
    log(`User saved: ${JSON.stringify({ email, referralCode })}`);
    res.json({ message: 'Verification code sent' });
  } catch (err) {
    log(`Signup error: ${err.message}`);
    res.status(500).json({ error: 'Signup failed: ' + err.message });
  }
};

const login = async (req, res) => {
  const email = normalize(req.body.email);
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'User not found' });

    user.verificationCode = newCode();
    user.verificationCodeExpires = codeExpiry();
    await user.save();

    await sendVerificationEmail(email, user.verificationCode);
    log(`Verification code sent to: ${email}`);
    res.json({ message: 'Verification code sent' });
  } catch (err) {
    log(`Login email error: ${err.message}`);
    res.status(500).json({ error: 'Failed to send verification code: ' + err.message });
  }
};

const verify = async (req, res) => {
  const email = normalize(req.body.email);
  const code = (req.body.code || '').trim();
  if (!email || !code) return res.status(400).json({ error: 'Email and code required' });

  try {
    // DEV BYPASS: if BYPASS_CODE is set and matches, skip DB check
    if (process.env.BYPASS_CODE && code === process.env.BYPASS_CODE) {
      const user = await User.findOne({ email });
      if (!user) return res.status(400).json({ error: 'User not found' });

      user.verified = true;
      user.verificationCode = null;
      user.verificationCodeExpires = null;
      await user.save();

      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      log(`(BYPASS) Login successful for ${email}, token: ${token.substring(0,10)}...`);
      return res.json({ token, user: { email: user.email, tier: user.tier } });
    }

    const user = await User.findOne({ email, verificationCode: code });
    if (!user) return res.status(400).json({ error: 'Invalid code or email' });

    if (!user.verificationCodeExpires || user.verificationCodeExpires < new Date()) {
      return res.status(400).json({ error: 'Code expired. Please request a new one.' });
    }

    user.verified = true;
    user.verificationCode = null;
    user.verificationCodeExpires = null;
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    log(`Login successful for ${email}, token: ${token.substring(0,10)}...`);
    res.json({ token, user: { email: user.email, tier: user.tier } });
  } catch (err) {
    log(`Verify error: ${err.message}`);
    res.status(500).json({ error: 'Verification failed: ' + err.message });
  }
};

// NEW: return user info from token
const me = async (req, res) => {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ email: user.email, tier: user.tier, verified: user.verified });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

// Optional: keep existing frontend call `/dashboard`
const dashboard = async (req, res) => {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ email: user.email, tier: user.tier, verified: user.verified });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

module.exports = { signup, login, verify, me, dashboard };
