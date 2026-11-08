import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { redactUrl } from '@agentic/shared';
import { authRouter } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { adminRouter } from './routes/admin.routes';
import { devRouter } from './routes/dev.routes';
import { isMailCaptureEnabled } from './lib/mailer';

export const app = express();

// ─── Middleware ───────────────────────────────
app.use(helmet());
app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || '').split(','), credentials: true }));
// The largest valid body is a tutor question with its history (~250 KB worst case); see the gateway.
app.use(express.json({ limit: '512kb' }));
// Log URLs with one-time secrets (OAuth code/state, tokens) redacted; see redactUrl.
morgan.token('url', (req) => redactUrl((req as express.Request).originalUrl ?? req.url ?? ''));
app.use(morgan('combined', { stream: { write: (m) => logger.info(m.trim()) } }));

// ─── Health ───────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'user-service', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────
app.use('/auth', authRouter);
app.use('/users', userRouter);
app.use('/admin', adminRouter);
// Development only: lets the presenter open captured (undelivered) emails. Absent in production.
if (isMailCaptureEnabled()) app.use('/dev', devRouter);

// ─── Error Handling ───────────────────────────
app.use(errorHandler);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

