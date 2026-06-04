import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { prisma } from './lib/prisma';
import { redisClient } from './lib/redis';

const app = express();
const PORT = process.env.PORT || 4001;

// ─── Middleware ───────────────────────────────
app.use(helmet());
app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || '').split(','), credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('combined', { stream: { write: (m) => logger.info(m.trim()) } }));

// ─── Health ───────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'user-service', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────
app.use('/auth', authRouter);
app.use('/users', userRouter);

// ─── Error Handling ───────────────────────────
app.use(errorHandler);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// ─── Start ────────────────────────────────────
async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('✅ PostgreSQL connected');
    await redisClient.ping();
    logger.info('✅ Redis connected');

    const server = app.listen(PORT, () => {
      logger.info(`🚀 User Service running on port ${PORT}`);
    });

    const shutdown = async () => {
      logger.info('Shutting down user-service...');
      server.close(async () => {
        await prisma.$disconnect();
        await redisClient.quit();
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start user-service:', error);
    process.exit(1);
  }
}

bootstrap();
export default app;
