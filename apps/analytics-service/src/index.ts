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

const app = express();
const PORT = process.env.PORT || 4003;

app.use(helmet());
app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || '').split(','), credentials: true }));
app.use(express.json());
app.use(morgan('combined', { stream: { write: (m) => logger.info(m.trim()) } }));

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'analytics-service', timestamp: new Date().toISOString() });
});

app.use(requireAuth);
app.use('/analytics', analyticsRouter);
app.use(errorHandler);

async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('✅ PostgreSQL connected');

    await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/agentic_ai_logs');
    logger.info('✅ MongoDB connected');

    await redisClient.ping();
    logger.info('✅ Redis connected');

    // Subscribe to study events for real-time analytics updates
    await subscribeToEvents();

    app.listen(PORT, () => logger.info(`🚀 Analytics Service running on port ${PORT}`));
  } catch (err) {
    logger.error('Failed to start analytics-service:', err);
    process.exit(1);
  }
}

bootstrap();
export default app;
