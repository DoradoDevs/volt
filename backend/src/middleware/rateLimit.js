// backend/src/middleware/ratelimit.js
const { rateLimit } = require('express-rate-limit');

// Login/Signup/Verify limiter
const authLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  limit: 5,                // 5 requests/min per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Use X-Forwarded-For header from nginx proxy
  keyGenerator: (req) => req.ip,
  skip: (req) => !req.ip, // Skip if no IP
});

module.exports = { authLimiter };
