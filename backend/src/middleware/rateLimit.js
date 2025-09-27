// backend/src/middleware/ratelimit.js
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Login/Signup/Verify limiter
const authLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  limit: 5,                // 5 requests/min per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // IMPORTANT: use helper so IPv6 can't bypass
  keyGenerator: ipKeyGenerator,
});

module.exports = { authLimiter };
