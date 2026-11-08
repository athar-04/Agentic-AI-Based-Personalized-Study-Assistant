import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { analyticsRouter } from './routes/analytics.routes';
import { requireAuth } from './middleware/requireAuth';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { prisma } from './lib/prisma';
import { redisClient, subscribeToEvents } from './lib/redis';
import { AnalyticsService } from './services/analytics.service';
import { applyServerTimeouts, assertProductionConfig, handleShutdown, redactUrl } from '@agentic/shared';

const app = express();
const PORT = process.env.PORT || 4003;

app.use(helmet());
app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || '').split(','), credentials: true }));
app.use(express.json({ limit: '100kb' }));
// Log URLs with one-time secrets (OAuth code/state, tokens) redacted; see redactUrl.
morgan.token('url', (req) => redactUrl((req as express.Request).originalUrl ?? req.url ?? ''));
app.use(morgan('combined', { stream: { write: (m) => logger.info(m.trim()) } }));

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'analytics-service', timestamp: new Date().toISOString() });
});

app.use(requireAuth);
app.use('/analytics', analyticsRouter);
app.use(errorHandler);

async function bootstrap() {
  try {
    assertProductionConfig('analytics-service');
    await prisma.$connect();
    logger.info('✅ PostgreSQL connected');

    // Nothing in this service reads MongoDB yet; connect only when it is configured.
    if (process.env.MONGODB_URL) {
      await mongoose.connect(process.env.MONGODB_URL);
      logger.info('✅ MongoDB connected');
    } else {
      logger.info('MONGODB_URL not set; skipping MongoDB');
    }

    await redisClient.ping();
    logger.info('✅ Redis connected');

    // Subscribe to study events for real-time analytics updates
    const analytics = new AnalyticsService();
    await subscribeToEvents((userId) => analytics.recalculateAnalytics(userId));

    const server = app.listen(Number(PORT), process.env.HOST || '0.0.0.0', () => logger.info(`🚀 Analytics Service running on port ${PORT}`));
    applyServerTimeouts(server);
    handleShutdown(server, () => Promise.all([prisma.$disconnect(), redisClient.quit(), mongoose.disconnect()]), (m) => logger.info(m));
  } catch (err) {
    logger.error('Failed to start analytics-service:', err);
    process.exit(1);
  }
}

void bootstrap();
export default app;
