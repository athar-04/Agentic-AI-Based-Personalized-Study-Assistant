import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { studyPlanRouter } from './routes/studyPlan.routes';
import { sessionRouter } from './routes/session.routes';
import { topicRouter } from './routes/topic.routes';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth } from './middleware/requireAuth';
import { logger } from './utils/logger';
import { prisma } from './lib/prisma';
import { redisClient } from './lib/redis';

const app = express();
const PORT = process.env.PORT || 4002;

app.use(helmet());
app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || '').split(','), credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('combined', { stream: { write: (m) => logger.info(m.trim()) } }));

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'study-service', timestamp: new Date().toISOString() });
});

app.use(requireAuth);
app.use('/study/plans', studyPlanRouter);
app.use('/study/sessions', sessionRouter);
app.use('/study/topics', topicRouter);

app.use(errorHandler);
app.use((_req, res) => res.status(404).json({ success: false, error: 'Not found' }));

async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('✅ PostgreSQL connected');
    await redisClient.ping();
    logger.info('✅ Redis connected');
    app.listen(PORT, () => logger.info(`🚀 Study Service running on port ${PORT}`));
  } catch (err) {
    logger.error('Failed to start study-service:', err);
    process.exit(1);
  }
}

bootstrap();
export default app;
