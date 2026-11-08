import express from 'express';
import type { ServerResponse } from 'http';
import type { Socket } from 'net';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { redactUrl } from '@agentic/shared';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { v4 as uuidv4 } from 'uuid';

import { authAddressLimiter, rateLimiter, strictRateLimiter, emailRateLimiter } from './middleware/rateLimiter';
import { statusRouter, devMailboxGuard } from './routes/status';
import { internalTrafficHandler, trafficRecorder } from './middleware/traffic';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { logger } from './utils/logger';
import { healthRouter } from './routes/health';

/**
 * Proxies `/api/v1/<x>` to a service. If the service is down, the student gets the same JSON
 * shape as every other error, not a raw proxy failure; if an answer was already streaming, the
 * connection is simply ended.
 */
function proxyTo(target: string, prefix: string, name: string, silenceMs = 30_000) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: (path) => `${prefix}${path}`,
    // A service that goes quiet this long gets the 503 below instead of an endless wait. It times
    // silence, not total length, so a streamed tutor answer may run for as long as it keeps talking.
    proxyTimeout: Number(process.env.UPSTREAM_TIMEOUT_MS) || silenceMs,
    on: {
      proxyReq: fixRequestBody,
      error: (err, _req, res) => {
        logger.error(`Proxy error (${name}): ${err.message}`);
        const out = res as ServerResponse | Socket;
        if (!('setHeader' in out)) return void out.destroy();
        if (out.headersSent) return void out.end();
        out.statusCode = 503;
        out.setHeader('Content-Type', 'application/json');
        out.end(JSON.stringify({ success: false, error: 'This part of the service is unavailable right now. Please try again shortly.', code: 'SERVICE_UNAVAILABLE', timestamp: new Date().toISOString() }));
      },
    },
  });
}

/** Builds the gateway. Service addresses are read now, so tests can point them anywhere. */
export function buildApp(): express.Express {
  const app = express();
  const USER = process.env.USER_SERVICE_URL || 'http://localhost:4001';
  const STUDY = process.env.STUDY_SERVICE_URL || 'http://localhost:4002';
  const ANALYTICS = process.env.ANALYTICS_SERVICE_URL || 'http://localhost:4003';
  const ORCHESTRATOR = process.env.AI_ORCHESTRATOR_URL || 'http://localhost:8000';

  // The web app proxies /api/v1 through Next.js, so the client IP arrives in X-Forwarded-For.
  // Trust it only from the configured proxy hops (loopback by default), or rate limits would
  // see one IP for everyone — or let any client choose its own.
  app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
  app.disable('x-powered-by');

  // ─── Security & base middleware ───
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Protection'],
  }));

  // The largest valid body is a tutor question with 20 history turns: ~250 KB in a 3-byte script
  // such as Devanagari. Tight limits also cap how much a single request can make zod validate
  // (zod 3 has no fix for oversized collections).
  app.use(express.json({ limit: '512kb' }));
  app.use(express.urlencoded({ extended: true, limit: '512kb' }));
  // Log URLs with one-time secrets (OAuth code/state, tokens) redacted; see redactUrl.
  morgan.token('url', (req) => redactUrl((req as express.Request).originalUrl ?? req.url ?? ''));
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

  app.use((req, _res, next) => {
    const headerId = req.headers['x-request-id'];
    req.requestId = (Array.isArray(headerId) ? headerId[0] : headerId) || uuidv4();
    next();
  });

  // Liveness for container health checks: no downstream calls, and ahead of the rate limiter so a
  // probe every few seconds never uses up anyone's allowance.
  app.get('/livez', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Aggregate traffic counters for the admin console (before the limiter, so 429s are counted).
  app.use(trafficRecorder);
  // Read by user-service with a shared internal token; never proxied, 404 without the token.
  app.get('/internal/traffic', internalTrafficHandler);

  app.use(rateLimiter);
  app.use(requestLogger);

  // Deep health check (each service); not under /api/v1, so the web app never exposes it.
  app.use('/health', healthRouter);

  // ─── Public routes ───
  // Brute-force protection on credential and single-use-link endpoints: per account tried, with
  // one ceiling per address across them all (see middleware/rateLimiter.ts).
  app.use(['/api/v1/auth/login', '/api/v1/auth/admin/login', '/api/v1/auth/register', '/api/v1/auth/verify-email', '/api/v1/auth/reset-password'], authAddressLimiter, strictRateLimiter);
  app.use(['/api/v1/auth/resend-verification', '/api/v1/auth/forgot-password'], authAddressLimiter, emailRateLimiter);

  // Public service status (is the AI reachable?) so the UI can say so up front.
  app.use('/api/v1/status', statusRouter);

  // Development-only mailbox for captured (undelivered) email. See routes/status.ts for the guards.
  app.use('/api/v1/dev', devMailboxGuard, proxyTo(USER, '/dev', 'user-service'));
  app.use('/api/v1/auth', proxyTo(USER, '/auth', 'user-service'));

  // ─── Protected routes (JWT required) ───
  app.use('/api/v1', authMiddleware);
  app.use('/api/v1/users', proxyTo(USER, '/users', 'user-service'));
  // Admin console API. The gateway only checks the JWT; user-service re-checks the persisted
  // role, account status and admin session scope on every request.
  app.use('/api/v1/admin', proxyTo(USER, '/admin', 'user-service'));
  // Study includes the AI (tutor, quizzes, plan drafting), whose own budget is 50 s.
  app.use('/api/v1/study', proxyTo(STUDY, '/study', 'study-service', 75_000));
  app.use('/api/v1/analytics', proxyTo(ANALYTICS, '/analytics', 'analytics-service'));
  app.use('/api/v1/ai', proxyTo(ORCHESTRATOR, '/api', 'ai-orchestrator', 75_000));

  // ─── Errors ───
  app.use(errorHandler);
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found', timestamp: new Date().toISOString() });
  });

  return app;
}
