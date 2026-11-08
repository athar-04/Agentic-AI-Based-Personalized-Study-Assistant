import 'dotenv/config';
import { applyServerTimeouts, assertProductionConfig, handleShutdown } from '@agentic/shared';
import { buildApp } from './app';
import { logger } from './utils/logger';

// Before anything listens: unsafe production settings stop the process here.
assertProductionConfig('api-gateway');

const PORT = process.env.PORT || 4000;
const app = buildApp();

const server = app.listen(Number(PORT), process.env.HOST || '0.0.0.0', () => {
  logger.info(`🚀 API Gateway running on port ${PORT}`);
  logger.info(`🔗 User Service: ${process.env.USER_SERVICE_URL}`);
  logger.info(`🔗 Study Service: ${process.env.STUDY_SERVICE_URL}`);
  logger.info(`🔗 Analytics Service: ${process.env.ANALYTICS_SERVICE_URL}`);
  logger.info(`🔗 AI Orchestrator: ${process.env.AI_ORCHESTRATOR_URL}`);
});

applyServerTimeouts(server);
handleShutdown(server, undefined, (m) => logger.info(m));

export default app;
