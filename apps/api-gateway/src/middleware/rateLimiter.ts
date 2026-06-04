import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
    timestamp: new Date().toISOString(),
  },
  handler: (req, res, _next, options) => {
    logger.warn(`Rate limit exceeded: IP=${req.ip} Path=${req.path}`);
    res.status(options.statusCode).json(options.message);
  },
  skip: (req) => req.path === '/health',
});

export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many attempts. Please try again in 15 minutes.',
    timestamp: new Date().toISOString(),
  },
});
