import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { redactUrl } from '@agentic/shared';
import { studyPlanRouter } from './routes/studyPlan.routes';
import { sessionRouter } from './routes/session.routes';
import { topicRouter } from './routes/topic.routes';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth } from './middleware/requireAuth';
import { requireActiveUser } from './middleware/requireActiveUser';
import { aiRouter, overviewRouter, practiceRouter, revisionRouter } from './routes/learning.routes';
import { aiDescription } from './lib/ai';
import { logger } from './utils/logger';

export const app = express();

app.use(helmet());
app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || '').split(','), credentials: true }));
// The largest valid body is a tutor question with its history (~250 KB worst case); see the gateway.
app.use(express.json({ limit: '512kb' }));
// Log URLs with one-time secrets (OAuth code/state, tokens) redacted; see redactUrl.
morgan.token('url', (req) => redactUrl((req as express.Request).originalUrl ?? req.url ?? ''));
app.use(morgan('combined', { stream: { write: (m) => logger.info(m.trim()) } }));

app.get('/health', (_req, res) => {
  // Reports whether an AI provider is configured (host and model only, never the key).
  res.json({ status: 'healthy', service: 'study-service', ai: aiDescription(), timestamp: new Date().toISOString() });
});

app.use(requireAuth, requireActiveUser);
app.use('/study/overview', overviewRouter);
app.use('/study/revisions', revisionRouter);
app.use('/study/quizzes', practiceRouter);
app.use('/study/ai', aiRouter);
app.use('/study/plans', studyPlanRouter);
app.use('/study/sessions', sessionRouter);
app.use('/study/topics', topicRouter);

app.use(errorHandler);
app.use((_req, res) => res.status(404).json({ success: false, error: 'Not found' }));
