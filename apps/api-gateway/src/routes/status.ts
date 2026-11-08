import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';

export const statusRouter = Router();

const CACHE_MS = 15_000;
let cached: { at: number; aiAvailable: boolean } | null = null;

/** Reports whether AI features can answer. Says nothing about keys or config. */
statusRouter.get('/', async (_req: Request, res: Response) => {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    // Available if study-service has an AI provider configured, or the orchestrator is up.
    let aiAvailable = false;
    try {
      const r = await axios.get<{ ai?: { configured?: boolean } }>(`${process.env.STUDY_SERVICE_URL || 'http://localhost:4002'}/health`, { timeout: 1500 });
      aiAvailable = r.data.ai?.configured === true;
    } catch {
      aiAvailable = false;
    }
    if (!aiAvailable) {
      try {
        await axios.get(`${process.env.AI_ORCHESTRATOR_URL || 'http://localhost:8000'}/health`, { timeout: 1500 });
        aiAvailable = true;
      } catch {
        aiAvailable = false;
      }
    }
    cached = { at: Date.now(), aiAvailable };
  }
  res.json({
    success: true,
    data: {
      ai: { available: cached.aiAvailable },
      devMailbox: devMailboxEnabled(),
    },
    timestamp: new Date().toISOString(),
  });
});

export function devMailboxEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_MAILBOX === 'true';
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * The captured mailbox holds live verification and reset links, so it is local-development only.
 * The check uses the raw socket address, not req.ip: Next's rewrite proxy forwards LAN requests
 * from 127.0.0.1 without adding X-Forwarded-For, and a client could forge that header anyway.
 * Any forwarding header means the request came through a proxy we can't vouch for.
 */
export function devMailboxGuard(req: Request, res: Response, next: NextFunction): void {
  const forwarded = req.headers['x-forwarded-for'] !== undefined || req.headers.forwarded !== undefined;
  const hostOk = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(req.headers['x-forwarded-host'] ?? req.headers.host ?? ''));
  if (!devMailboxEnabled() || forwarded || !hostOk || !LOOPBACK.has(req.socket.remoteAddress ?? '')) {
    res.status(404).json({ success: false, error: 'Route not found', timestamp: new Date().toISOString() });
    return;
  }
  next();
}
