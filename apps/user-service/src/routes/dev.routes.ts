import { Router } from 'express';
import { listCapturedMail } from '../lib/mailer';
import { successResponse } from '@agentic/shared';

/**
 * Dev mailbox. Mounted only when MAIL_TRANSPORT=capture outside production (see app.ts), and the
 * gateway additionally serves it to loopback clients only. Messages here were NOT delivered.
 */
export const devRouter = Router();

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Its own check too: this port can be reached without going through the gateway.
devRouter.use((req, res, next) => {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }
  next();
});

devRouter.get('/mailbox', (_req, res) => {
  res.json(successResponse({ transport: 'capture', delivered: false, messages: listCapturedMail() }));
});
