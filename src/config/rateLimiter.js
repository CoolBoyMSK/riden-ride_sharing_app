import rateLimit from 'express-rate-limit';

const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Add RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
});

export default globalRateLimiter;
