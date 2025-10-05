// backend/src/controllers/auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const web3 = require('@solana/web3.js');
const bs58 = require('bs58');

const User = require('../models/user');
const { encrypt } = require('../services/solana');
const { sendEmail } = require('../config/email'); // << correct path

const normalizeEmail = (e) => (e || '').trim().toLowerCase();
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();
const tokenFor = (userId) => jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });

async function ensureDepositWallet(user) {
  if (!user.sourceEncrypted) {
    const kp = web3.Keypair.generate();
    user.sourceEncrypted = encrypt(bs58.encode(kp.secretKey));
  }
}

async function issueCodeAndEmail(user, email) {
  const code = generateCode();                 // ALWAYS random for email
  user.verificationCode = code;
  user.verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000);

  // DEBUG: log the code we’re saving/sending
  console.log(`[auth] issuing code for ${email}: ${code}`);

  await user.save();

  try {
    await sendEmail(
      email,
      'Your VolT verification code',
      `Your verification code is: ${code}\nIt expires in 15 minutes.`
    );
    console.log(`[auth] email dispatched to ${email}`);
  } catch (e) {
    console.warn('[auth] sendEmail failed:', e.message);
  }
}

/** POST /signup { email, referrer? } */
const signup = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const referrer = req.body.referrer || null;
  if (!email) return res.status(400).json({ error: 'Email required' });

  let user = await User.findOne({ email });
  if (!user) {
    const referralCode = crypto.randomBytes(3).toString('hex');
    user = await User.create({ email, referralCode, referrer });
  }

  await ensureDepositWallet(user);
  await issueCodeAndEmail(user, email);
  res.json({ ok: true });
};

/** POST /login { email } - auto-creates account if doesn't exist */
const login = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) return res.status(400).json({ error: 'Email required' });

  let user = await User.findOne({ email });

  // Auto-create account if it doesn't exist
  if (!user) {
    const referralCode = crypto.randomBytes(3).toString('hex');
    user = new User({
      email,
      referralCode,
      verified: false,
    });
    await user.save();
  }

  await ensureDepositWallet(user);
  await issueCodeAndEmail(user, email);
  res.json({ ok: true });
};

/** POST /verify { email, code } */
const verify = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = (req.body.code || '').trim();

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'No account found' });

  const now = new Date();
  const bypass = process.env.BYPASS_CODE && code === process.env.BYPASS_CODE; // allowed only at verify
  const emailedValid =
    user.verificationCode === code &&
    user.verificationCodeExpires &&
    user.verificationCodeExpires > now;

  if (!(bypass || emailedValid)) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  user.verified = true;
  user.verificationCode = null;
  user.verificationCodeExpires = null;
  await user.save();

  const token = tokenFor(user._id.toString());
  res.json({ token, user: { email: user.email } });
};

/** GET /auth/me */
const me = async (req, res) => {
  const user = await User.findById(req.userId).lean();
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ email: user.email });
};

module.exports = { signup, login, verify, me };
