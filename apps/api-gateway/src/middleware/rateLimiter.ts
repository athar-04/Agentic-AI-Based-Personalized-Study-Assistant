import { createHash } from 'crypto';
import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { extractBearerToken, verifyAccessToken } from '@agentic/auth';
import { logger } from '../utils/logger';

// Students often share one public address: campus Wi-Fi, and mobile carriers that put thousands
// of phones behind one IP. Limits keyed only by IP would lock out a whole class because of one
// busy student, so signed-in traffic counts against the account, and credential attempts against
// the account being tried, with a looser per-address ceiling on top.

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const envNumber = (name: string, fallback: number) => Number(process.env[name]) || fallback;
const limitMessage = (error: string) => ({ success: false, error, code: 'RATE_LIMITED', timestamp: new Date().toISOString() });

/** The signed-in account if the request carries a valid token, otherwise the client address. */
function accountOrAddress(req: Request): string {
  const token = extractBearerToken(req.headers.authorization);
  if (token) {
    try {
      return `user:${verifyAccessToken(token).userId}`;
    } catch {
      /* invalid or expired: counts against the address like any anonymous request */
    }
  }
  return `ip:${req.ip}`;
}

/** Address plus the account being tried: the email, or a hash of a single-use link token. */
function addressAndSubject(req: Request): string {
  const body = (req.body ?? {}) as { email?: unknown; token?: unknown };
  let subject = '';
  if (typeof body.email === 'string') subject = body.email.trim().toLowerCase().slice(0, 254);
  else if (typeof body.token === 'string') subject = createHash('sha256').update(body.token).digest('hex').slice(0, 16);
  return `${req.ip}|${subject}`;
}

/** Everything through the gateway. Abuse protection, not a quota: a dashboard visit alone makes several calls. */
export const rateLimiter = rateLimit({
  windowMs: envNumber('RATE_LIMIT_WINDOW_MS', FIFTEEN_MINUTES),
  max: envNumber('RATE_LIMIT_MAX_REQUESTS', 1000),
  keyGenerator: accountOrAddress,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
  handler: (req, res, _next, options) => {
    logger.warn(`Rate limit exceeded: path=${req.path}`);
    res.status(options.statusCode).json(limitMessage('Too many requests. Please wait a moment and try again.'));
  },
});

// Credential and single-use-link endpoints: 10 tries per account per address in 15 minutes.
export const strictRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: envNumber('AUTH_RATE_LIMIT_MAX', 10),
  keyGenerator: addressAndSubject,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many attempts. Please try again in 15 minutes.'),
});

// Endpoints that send email: tighter, on top of the per-account cooldown in user-service.
export const emailRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: envNumber('EMAIL_RATE_LIMIT_MAX', 5),
  keyGenerator: addressAndSubject,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many email requests. Please wait a few minutes before trying again.'),
});

// One ceiling per address across all of the above, so a single address can't work through many
// accounts. Roomy enough for a class signing up together.
export const authAddressLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: envNumber('AUTH_IP_RATE_LIMIT_MAX', 100),
  keyGenerator: (req) => `ip:${req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many attempts from this network. Please try again in 15 minutes.'),
});
