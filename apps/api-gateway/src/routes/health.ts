import { Router, Request, Response } from 'express';
import axios from 'axios';

export const healthRouter = Router();

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  /** Optional services (analytics, the Python orchestrator) don't make the whole stack degraded. */
  optional: boolean;
  latencyMs?: number;
}

async function checkService(name: string, url: string, optional = false): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await axios.get(`${url}/health`, { timeout: 3000 });
    return { name, status: 'healthy', optional, latencyMs: Date.now() - start };
  } catch {
    return { name, status: 'unhealthy', optional, latencyMs: Date.now() - start };
  }
}

healthRouter.get('/', async (_req: Request, res: Response) => {
  const services = await Promise.all([
    checkService('user-service', process.env.USER_SERVICE_URL || 'http://localhost:4001'),
    checkService('study-service', process.env.STUDY_SERVICE_URL || 'http://localhost:4002'),
    checkService('analytics-service', process.env.ANALYTICS_SERVICE_URL || 'http://localhost:4003', true),
    checkService('ai-orchestrator', process.env.AI_ORCHESTRATOR_URL || 'http://localhost:8000', true),
  ]);

  const allHealthy = services.every((s) => s.optional || s.status === 'healthy');

  res.status(allHealthy ? 200 : 207).json({
    status: allHealthy ? 'healthy' : 'degraded',
    service: 'api-gateway',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services,
  });
});
