import rateLimit from 'express-rate-limit';

const globalRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Add RateLimit-* headers
  legacyHeaders: true, // Disable X-RateLimit-* headers
});

export default globalRateLimiter;
