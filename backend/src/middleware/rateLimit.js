const rateLimit = require('express-rate-limit');

// Keyed by IP + normalized email (when present)
const keyGenerator = (req) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const email = (req.body?.email || '').trim().toLowerCase();
  return `${ip}:${email}`;
};

// Conservative default: 5 requests / minute per IP+email
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: { error: 'Too many attempts. Please wait a minute and try again.' },
});

module.exports = { authLimiter };
