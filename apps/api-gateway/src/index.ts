import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { v4 as uuidv4 } from 'uuid';

import { rateLimiter } from './middleware/rateLimiter';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { logger } from './utils/logger';
import { healthRouter } from './routes/health';

const app = express();
const PORT = process.env.PORT || 4000;

// ─────────────────────────────────────────────
// Security & Base Middleware
// ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Request ID injection
app.use((req, _res, next) => {
  const headerId = req.headers['x-request-id'];
  req.requestId = (Array.isArray(headerId) ? headerId[0] : headerId) || uuidv4();
  next();
});

// ─────────────────────────────────────────────
// Rate Limiting
// ─────────────────────────────────────────────
app.use(rateLimiter);

// ─────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────
app.use(requestLogger);

// ─────────────────────────────────────────────
// Health Check (no auth required)
// ─────────────────────────────────────────────
app.use('/health', healthRouter);

// ─────────────────────────────────────────────
// Public Routes — Auth (proxied to user-service)
// ─────────────────────────────────────────────
app.use('/api/v1/auth', createProxyMiddleware({
  target: process.env.USER_SERVICE_URL || 'http://localhost:4001',
  changeOrigin: true,
  pathRewrite: { '^/api/v1/auth': '/auth' },
  on: {
    proxyReq: fixRequestBody,
    error: (err, _req, res: any) => {
      logger.error('Proxy error (user-service):', err.message);
      res.status(503).json({ success: false, error: 'User service unavailable' });
    },
  },
}));

// ─────────────────────────────────────────────
// Protected Routes (JWT required)
// ─────────────────────────────────────────────
app.use('/api/v1', authMiddleware);

// Users
app.use('/api/v1/users', createProxyMiddleware({
  target: process.env.USER_SERVICE_URL || 'http://localhost:4001',
  changeOrigin: true,
  pathRewrite: { '^/api/v1/users': '/users' },
  on: {
    proxyReq: fixRequestBody,
  },
}));

// Study Plans
app.use('/api/v1/study', createProxyMiddleware({
  target: process.env.STUDY_SERVICE_URL || 'http://localhost:4002',
  changeOrigin: true,
  pathRewrite: { '^/api/v1/study': '/study' },
  on: {
    proxyReq: fixRequestBody,
  },
}));

// Analytics
app.use('/api/v1/analytics', createProxyMiddleware({
  target: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:4003',
  changeOrigin: true,
  pathRewrite: { '^/api/v1/analytics': '/analytics' },
  on: {
    proxyReq: fixRequestBody,
  },
}));

// AI Orchestrator
app.use('/api/v1/ai', createProxyMiddleware({
  target: process.env.AI_ORCHESTRATOR_URL || 'http://localhost:8000',
  changeOrigin: true,
  pathRewrite: { '^/api/v1/ai': '/api' },
  on: {
    proxyReq: fixRequestBody,
    error: (err, _req, res: any) => {
      logger.error('Proxy error (ai-orchestrator):', err.message);
      res.status(503).json({ success: false, error: 'AI service unavailable' });
    },
  },
}));

// ─────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────
app.use(errorHandler);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found', timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info(`🚀 API Gateway running on port ${PORT}`);
  logger.info(`🔗 User Service: ${process.env.USER_SERVICE_URL}`);
  logger.info(`🔗 Study Service: ${process.env.STUDY_SERVICE_URL}`);
  logger.info(`🔗 Analytics Service: ${process.env.ANALYTICS_SERVICE_URL}`);
  logger.info(`🔗 AI Orchestrator: ${process.env.AI_ORCHESTRATOR_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
