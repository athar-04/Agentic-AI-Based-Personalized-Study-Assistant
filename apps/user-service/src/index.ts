import 'dotenv/config';
import { app } from './app';
import { logger } from './utils/logger';
import { prisma } from './lib/prisma';
import { redisClient } from './lib/redis';
import { applyServerTimeouts, assertProductionConfig, handleShutdown } from '@agentic/shared';

const PORT = process.env.PORT || 4001;

// ─── Start ────────────────────────────────────
async function bootstrap() {
  try {
    assertProductionConfig('user-service');
    await prisma.$connect();
    logger.info('✅ PostgreSQL connected');
    await redisClient.ping();
    logger.info('✅ Redis connected');

    const server = app.listen(Number(PORT), process.env.HOST || '0.0.0.0', () => {
      logger.info(`🚀 User Service running on port ${PORT}`);
    });

    applyServerTimeouts(server);
    handleShutdown(server, () => Promise.all([prisma.$disconnect(), redisClient.quit()]), (m) => logger.info(m));
  } catch (error) {
    logger.error('Failed to start user-service:', error);
    process.exit(1);
  }
}

void bootstrap();
export default app;
